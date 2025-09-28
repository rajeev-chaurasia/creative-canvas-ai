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
    uuid: str
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    user_role: Optional[str] = None  # Added dynamically in permissions.py

    class Config:
        from_attributes = True

class ProjectWithShares(Project):
    """Project with sharing information"""
    owner: Optional['UserBase'] = None
    shared_with: List['ProjectShareInfo'] = []

    class Config:
        from_attributes = True

class ProjectShareInfo(BaseModel):
    """Information about a project share"""
    user_id: int
    name: Optional[str] = None
    email: str
    role: str
    invited_at: datetime
    accepted_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ProjectShareCreate(BaseModel):
    """Create a new project share"""
    email: str
    role: str  # "editor" or "viewer"

class ProjectShareUpdate(BaseModel):
    """Update an existing project share"""
    role: str  # "editor" or "viewer"

class ShareInviteResponse(BaseModel):
    """Response when creating a share invite"""
    share_id: Optional[int] = None
    invite_sent: bool
    invite_token: Optional[str] = None
    message: str

    class Config:
        from_attributes = True

class ProjectListResponse(BaseModel):
    """Response for listing user's projects"""
    owned: List[Project]
    shared: List[Project]

class UserBase(BaseModel):
    email: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    google_id: str

class User(UserBase):
    id: int
    projects: List[Project] = []

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
