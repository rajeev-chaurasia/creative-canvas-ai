from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from starlette.responses import RedirectResponse
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests


from .. import crud, schemas, models
from ..database import get_db
import os

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@router.get("/google")
async def login_google():
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={GOOGLE_CLIENT_ID}&redirect_uri={GOOGLE_REDIRECT_URI}&scope=openid%20email%20profile")

@router.get("/google/callback")
async def auth_google_callback(code: str, db: Session = Depends(get_db)):
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    
    import httpx
    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=data)
    
    token_data = response.json()
    id_info = id_token.verify_oauth2_token(token_data['id_token'], google_requests.Request(), GOOGLE_CLIENT_ID)

    email = id_info['email']
    google_id = id_info['sub']
    full_name = id_info.get('name')

    user = crud.get_user_by_google_id(db, google_id=google_id)
    if not user:
        user_in = schemas.UserCreate(email=email, google_id=google_id, full_name=full_name)
        user = crud.create_user(db, user=user_in)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(data={"sub": user.email, "user_id": user.id})
    
    # Redirect to the frontend with both tokens
    return RedirectResponse(url=f"http://localhost:5173/auth/callback?token={access_token}&refresh_token={refresh_token}")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        if not SECRET_KEY:
            print("ERROR: SECRET_KEY is not set!")
            raise credentials_exception
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError as e:
        print(f"JWT Error: {e}")
        raise credentials_exception
    user = crud.get_user_by_email(db, email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

@router.post("/refresh")
async def refresh_access_token(refresh_token: str, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        if not SECRET_KEY:
            raise credentials_exception
        
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Verify it's a refresh token
        token_type: str = payload.get("type")
        if token_type != "refresh":
            raise credentials_exception
        
        email: str = payload.get("sub")
        user_id = payload.get("user_id")
        
        # If refresh token doesn't have user_id, force re-login
        if email is None or user_id is None:
            print(f"⚠️  Old refresh token detected for {email}, forcing re-login")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token format outdated. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
    except JWTError as e:
        print(f"JWT Error during refresh: {e}")
        raise credentials_exception
    
    # Verify user still exists
    user = crud.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    
    # Create new access token with user_id
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id}, expires_delta=access_token_expires
    )
    
    print(f"🔄 Refreshed token for user: {user.email} (ID: {user.id})")
    print(f"🔑 New token includes user_id: {user.id}")
    
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60  # in seconds
    }

@router.post("/logout")
async def logout():
    """
    Logout endpoint - client should clear tokens from localStorage
    This is a placeholder endpoint for consistency
    """
    return {"message": "Logged out successfully. Clear your tokens from localStorage."}


@router.get("/me", response_model=schemas.User)
async def read_current_user(current_user: models.User = Depends(get_current_user)):
    """
    Returns the currently authenticated user's profile.
    Frontend should call this with Authorization: Bearer <access_token>
    """
    # The Pydantic response model (schemas.User) will be populated via from_attributes
    return current_user
