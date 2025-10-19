from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
import uuid as uuid_lib
from datetime import datetime

from .. import crud, schemas, models
from ..database import get_db
from ..permissions import (
    require_permission,
    get_user_role,
    get_user_projects,
    log_activity,
    can_access_via_link
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
    try:
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
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")

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
    share_token: str = Query(None),
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Get a specific project by UUID (requires view permission or valid share_token)"""
    project = await require_permission(project_uuid, current_user.id, db, "view", share_token=share_token)
    
    # Add user's role to response
    role = await get_user_role(project_uuid, current_user.id, db)
    
    # If user accessed via link and doesn't already have explicit access, auto-add as viewer
    if share_token and not role and (await can_access_via_link(project_uuid, share_token, db)):
        # Auto-add user as viewer
        new_share = models.ProjectShare(
            project_id=project.id,
            user_id=current_user.id,
            role=models.ProjectRole.VIEWER,
            invited_by=project.owner_id,
            accepted_at=datetime.now()
        )
        db.add(new_share)
        db.commit()
        
        # Log activity
        await log_activity(
            project_id=project.id,
            user_id=current_user.id,
            action="joined",
            db=db,
            details={"via_public_link": True}
        )
        
        role = models.ProjectRole.VIEWER
    
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
    try:
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
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update project: {str(e)}")


@router.patch("/{project_uuid}", response_model=schemas.Project)
async def patch_project(
    project_uuid: str,
    project: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Partial update for a project (only provided fields are updated)"""
    try:
        db_project = await require_permission(project_uuid, current_user.id, db, "edit")

        update_data = project.dict(exclude_unset=True)
        if not update_data:
            return db_project

        for key, value in update_data.items():
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
            details={"updated_fields": list(update_data.keys())}
        )

        # Add user's role
        role = await get_user_role(project_uuid, current_user.id, db)
        db_project.user_role = role.value if role else None

        return db_project
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to patch project: {str(e)}")

@router.delete("/{project_uuid}")
async def delete_project(
    project_uuid: str, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Delete a project (requires delete permission - owner only)"""
    try:
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
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")
