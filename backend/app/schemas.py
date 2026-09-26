from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ProjectBase(BaseModel):
    title: str
    canvas_state: Optional[dict] = None

class ProjectCreate(ProjectBase):
    pass

class Project(ProjectBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True

class UserBase(BaseModel):
    email: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    google_id: str

class User(UserBase):
    id: int
    projects: List[Project] = []

    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
