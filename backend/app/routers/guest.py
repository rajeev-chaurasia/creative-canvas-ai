from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import uuid

from ..database import get_db
from .. import crud, schemas
from ..routers.auth import get_current_user

router = APIRouter(
    prefix="/guest",
    tags=["guest"],
)

GUEST_TTL_DAYS = 30


@router.post("/token")
async def create_guest_token():
    """Issue a short-lived guest id (opaque string). Frontend should store this in localStorage.
    The token is not a JWT for now — it's a UUID. It will be used to create/update guest projects.
    """
    guest_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=GUEST_TTL_DAYS)
    if not guest_id:
        raise HTTPException(status_code=400, detail="Failed to generate guest ID")
    return {"guest_id": guest_id, "expires_at": expires_at.isoformat()}


@router.post("/projects")
async def create_guest_project(project: schemas.ProjectCreate, guest_id: str = Header(...), db: Session = Depends(get_db)):
    """Create a new project as guest. Requires `guest_id` header."""
    if not guest_id or not guest_id.strip():
        raise HTTPException(status_code=400, detail="Invalid guest_id")
    try:
        expires_at = datetime.now(timezone.utc) + timedelta(days=GUEST_TTL_DAYS)
        db_project = crud.create_guest_project(db, project=project, guest_id=guest_id, expires_at=expires_at)
        return db_project
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_uuid}")
async def get_guest_project(project_uuid: str, guest_id: str = Header(...), db: Session = Depends(get_db)):
    """Get a specific guest project. Requires valid `guest_id` header."""
    if not guest_id or not guest_id.strip():
        raise HTTPException(status_code=400, detail="Invalid guest_id")
    try:
        project = crud.get_guest_project(db, project_uuid=project_uuid, guest_id=guest_id)
        if not project:
            raise HTTPException(status_code=404, detail="Guest project not found or invalid guest token")
        return project
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/projects/{project_uuid}")
async def update_guest_project(project_uuid: str, project: schemas.ProjectUpdate, guest_id: str = Header(...), db: Session = Depends(get_db)):
    """Update a guest project. Requires valid `guest_id` header."""
    if not guest_id or not guest_id.strip():
        raise HTTPException(status_code=400, detail="Invalid guest_id")
    db_project = crud.update_guest_project(db, project_uuid=project_uuid, project=project, guest_id=guest_id)
    if not db_project:
        raise HTTPException(status_code=404, detail="Guest project not found or invalid guest token")
    return db_project


@router.post("/claim")
async def claim_guest( claim: schemas.GuestClaimRequest, current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    """Claim guest projects (transfer ownership) for the authenticated user."""
    try:
        projects = crud.claim_guest_projects(db, guest_id=claim.guest_id, user_id=current_user.id, project_uuids=claim.project_uuids)
        return {"claimed": [p.uuid for p in projects]}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects")
async def list_guest_projects(guest_id: str = Header(...), db: Session = Depends(get_db)):
    """List projects associated with a guest_id"""
    if not guest_id or not guest_id.strip():
        raise HTTPException(status_code=400, detail="Invalid guest_id")
    try:
        projects = crud.get_guest_projects(db, guest_id=guest_id)
        # Return minimal metadata to frontend to reduce payload
        result = [
            {"uuid": p.uuid, "title": p.title, "created_at": p.created_at.isoformat() if p.created_at else None}
            for p in projects
        ]
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
