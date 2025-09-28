from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid as uuid_lib

from .. import crud, schemas, models
from ..database import get_db
from ..permissions import (
    require_permission,
    get_user_role,
    get_user_projects,
    log_activity
)
from .auth import get_current_user

router = APIRouter(
    prefix="/api/projects",
    tags=["projects"],
    dependencies=[Depends(get_current_user)]
)

@router.post("/", response_model=schemas.Project)
async def create_project(
    project: schemas.ProjectCreate, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Create a new project with auto-generated UUID"""
    print(f"📝 Creating project with title: '{project.title}'")
    print(f"📝 Canvas state: {project.canvas_state}")
    
    db_project = models.Project(
        uuid=str(uuid_lib.uuid4()),
        title=project.title,
        canvas_state=project.canvas_state,
        owner_id=current_user.id
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # Log activity
    await log_activity(
        project_id=db_project.id,
        user_id=current_user.id,
        action="created",
        db=db,
        details={"title": project.title}
    )
    
    # Add user_role for consistency
    db_project.user_role = "owner"
    
    return db_project

@router.get("/", response_model=schemas.ProjectListResponse)
async def read_projects(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Get all projects (owned and shared) for current user"""
    return await get_user_projects(current_user.id, db, skip, limit)

@router.get("/{project_uuid}", response_model=schemas.Project)
async def read_project(
    project_uuid: str, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Get a specific project by UUID (requires view permission)"""
    project = await require_permission(project_uuid, current_user.id, db, "view")
    
    # Add user's role to response
    role = await get_user_role(project_uuid, current_user.id, db)
    project.user_role = role.value if role else None
    
    return project

@router.put("/{project_uuid}", response_model=schemas.Project)
async def update_project(
    project_uuid: str, 
    project: schemas.ProjectCreate, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Update a project (requires edit permission)"""
    db_project = await require_permission(project_uuid, current_user.id, db, "edit")
    
    project_data = project.dict(exclude_unset=True)
    for key, value in project_data.items():
        setattr(db_project, key, value)
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # Log activity
    await log_activity(
        project_id=db_project.id,
        user_id=current_user.id,
        action="edited",
        db=db,
        details={"updated_fields": list(project_data.keys())}
    )
    
    # Add user's role
    role = await get_user_role(project_uuid, current_user.id, db)
    db_project.user_role = role.value if role else None
    
    return db_project

@router.delete("/{project_uuid}")
async def delete_project(
    project_uuid: str, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Delete a project (requires delete permission - owner only)"""
    db_project = await require_permission(project_uuid, current_user.id, db, "delete")
    
    # Log activity before deletion
    await log_activity(
        project_id=db_project.id,
        user_id=current_user.id,
        action="deleted",
        db=db,
        details={"title": db_project.title}
    )
    
    db.delete(db_project)
    db.commit()
    
    return {"message": "Project deleted successfully"}
