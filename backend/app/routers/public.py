"""
Public routes - accessible without authentication
Allows unauthenticated users to view and download projects via public share link
"""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from .. import schemas, models
from ..database import get_db
from ..permissions import can_access_via_link, get_project_by_uuid

router = APIRouter(
    prefix="/api/public",
    tags=["public"],
)


@router.get("/projects/{project_uuid}", response_model=schemas.Project)
async def view_project_public(
    project_uuid: str,
    share_token: str = Query(...),  # Required
    db: Session = None
):
    """
    View a project publicly via share token (no auth required).
    Allows unauthenticated users to see the project if it has a valid public share token.
    User is NOT added to ProjectShare table (remains anonymous).
    
    Args:
        project_uuid: UUID of the project
        share_token: Public share token from the link
    
    Returns:
        Project data with canvas_state (but without user_role since viewer is anonymous)
    """
    
    # Note: We need to handle DB connection here since this route doesn't have Depends(get_db)
    # In FastAPI, we should use Depends for DB, but for public routes we need to be careful
    # This is a simplified version - in production use proper dependency injection
    
    from ..database import SessionLocal
    db = SessionLocal()
    
    try:
        # Validate share token
        has_link_access = await can_access_via_link(project_uuid, share_token, db)
        if not has_link_access:
            raise HTTPException(status_code=403, detail="Invalid or expired share token")
        
        # Get project
        project = await get_project_by_uuid(project_uuid, db)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Return project data (read-only)
        return project
    
    finally:
        db.close()


@router.post("/projects/{project_uuid}/export")
async def export_project_public(
    project_uuid: str,
    share_token: str = Query(...),
    format: str = Query("json", regex="^(json|canvas)$")  # json or canvas format
):
    """
    Export/download a project as guest (no auth required).
    Allows unauthenticated users to download the canvas state as JSON or Canvas file.
    
    Args:
        project_uuid: UUID of the project
        share_token: Public share token
        format: Export format (json or canvas)
    
    Returns:
        JSON file of canvas state
    """
    
    from ..database import SessionLocal
    from fastapi.responses import JSONResponse, FileResponse
    import json
    from datetime import datetime
    
    db = SessionLocal()
    
    try:
        # Validate share token
        has_link_access = await can_access_via_link(project_uuid, share_token, db)
        if not has_link_access:
            raise HTTPException(status_code=403, detail="Invalid or expired share token")
        
        # Get project
        project = await get_project_by_uuid(project_uuid, db)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Prepare export data
        export_data = {
            "project": {
                "uuid": project.uuid,
                "title": project.title,
                "created_at": project.created_at.isoformat() if project.created_at else None,
                "exported_at": datetime.now().isoformat(),
            },
            "canvas_state": project.canvas_state or {"objects": []}
        }
        
        if format == "json":
            # Return as JSON download
            return JSONResponse(
                content=export_data,
                headers={
                    "Content-Disposition": f'attachment; filename="{project.title or "canvas"}_export.json"'
                }
            )
        
        # You can add more formats (canvas, svg, etc.) here in the future
        raise HTTPException(status_code=400, detail="Unsupported format")
    
    finally:
        db.close()


@router.get("/projects/{project_uuid}/metadata")
async def get_project_metadata_public(
    project_uuid: str,
    share_token: str = Query(...)
):
    """
    Get minimal project metadata (title, owner) without canvas state.
    Useful for previewing before loading the full project.
    
    Args:
        project_uuid: UUID of the project
        share_token: Public share token
    
    Returns:
        Project metadata only
    """
    
    from ..database import SessionLocal
    
    db = SessionLocal()
    
    try:
        # Validate share token
        has_link_access = await can_access_via_link(project_uuid, share_token, db)
        if not has_link_access:
            raise HTTPException(status_code=403, detail="Invalid or expired share token")
        
        # Get project
        project = await get_project_by_uuid(project_uuid, db)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Return minimal metadata
        return {
            "uuid": project.uuid,
            "title": project.title,
            "owner": {
                "name": project.owner.full_name or "Anonymous",
                "email": project.owner.email
            },
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "is_public": project.public_share_token is not None
        }
    
    finally:
        db.close()
