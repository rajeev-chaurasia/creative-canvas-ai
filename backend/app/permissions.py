"""
Permission utilities for project access control
"""

from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

from .models import Project, ProjectShare, ProjectRole, User


async def get_user_role(
    project_uuid: str, 
    user_id: int, 
    db: Session
) -> Optional[ProjectRole]:
    """
    Get user's role in a project.
    
    Returns:
        - ProjectRole.OWNER if user owns the project
        - ProjectRole.EDITOR/VIEWER if user has access via project_shares
        - None if user has no access
    """
    
    # Check if user is the owner
    project = db.query(Project).filter(
        Project.uuid == project_uuid,
        Project.owner_id == user_id
    ).first()
    
    if project:
        return ProjectRole.OWNER
    
    # Check project_shares table
    project = db.query(Project).filter(Project.uuid == project_uuid).first()
    if not project:
        return None
    
    share = db.query(ProjectShare).filter(
        ProjectShare.project_id == project.id,
        ProjectShare.user_id == user_id
    ).first()
    
    if share:
        return share.role
    
    return None


async def get_project_by_uuid(
    project_uuid: str,
    db: Session
) -> Optional[Project]:
    """Get project by UUID"""
    return db.query(Project).filter(Project.uuid == project_uuid).first()


async def can_access_via_link(
    project_uuid: str,
    share_token: Optional[str],
    db: Session
) -> bool:
    """Check if user can access project via public share link"""
    if not share_token:
        return False
    
    project = await get_project_by_uuid(project_uuid, db)
    if not project or not project.public_share_token:
        return False
    
    return project.public_share_token == share_token


async def can_view(
    project_uuid: str, 
    user_id: int, 
    db: Session,
    share_token: Optional[str] = None
) -> bool:
    """Check if user can view project (any role or via link)"""
    # Check if user has explicit access
    role = await get_user_role(project_uuid, user_id, db)
    if role is not None:
        return True
    
    # Check if user can access via link (anyone with link can view)
    return await can_access_via_link(project_uuid, share_token, db)


async def can_edit(
    project_uuid: str, 
    user_id: int, 
    db: Session
) -> bool:
    """Check if user can edit project (owner or editor)"""
    role = await get_user_role(project_uuid, user_id, db)
    return role in [ProjectRole.OWNER, ProjectRole.EDITOR]


async def can_share(
    project_uuid: str, 
    user_id: int, 
    db: Session
) -> bool:
    """Check if user can share project (owner or editor)"""
    role = await get_user_role(project_uuid, user_id, db)
    return role in [ProjectRole.OWNER, ProjectRole.EDITOR]


async def can_delete(
    project_uuid: str, 
    user_id: int, 
    db: Session
) -> bool:
    """Check if user can delete project (owner only)"""
    role = await get_user_role(project_uuid, user_id, db)
    return role == ProjectRole.OWNER


async def can_manage_permissions(
    project_uuid: str, 
    user_id: int, 
    db: Session
) -> bool:
    """Check if user can manage permissions (owner only)"""
    role = await get_user_role(project_uuid, user_id, db)
    return role == ProjectRole.OWNER


async def require_permission(
    project_uuid: str,
    user_id: int,
    db: Session,
    permission: str = "view",
    share_token: Optional[str] = None
) -> Project:
    """
    Require specific permission and return project.
    Raises HTTPException if permission denied.
    
    Args:
        permission: "view", "edit", "share", "delete", or "manage"
        share_token: optional token for link-based access (only for "view" permission)
    """
    
    project = await get_project_by_uuid(project_uuid, db)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # For view permission, also check link access
    if permission == "view" and share_token:
        has_link_access = await can_access_via_link(project_uuid, share_token, db)
        if has_link_access:
            return project
    
    permission_checks = {
        "view": can_view,
        "edit": can_edit,
        "share": can_share,
        "delete": can_delete,
        "manage": can_manage_permissions
    }
    
    check_func = permission_checks.get(permission)
    if not check_func:
        raise ValueError(f"Invalid permission type: {permission}")
    
    # For view, pass share_token to can_view
    if permission == "view":
        has_permission = await check_func(project_uuid, user_id, db, share_token)
    else:
        has_permission = await check_func(project_uuid, user_id, db)
    
    if not has_permission:
        raise HTTPException(
            status_code=403, 
            detail=f"You do not have permission to {permission} this project"
        )
    
    return project


async def get_user_projects(
    user_id: int,
    db: Session,
    skip: int = 0,
    limit: int = 100
):
    """
    Get all projects accessible by user, separated into owned and shared.
    
    Returns:
        {
            "owned": [projects owned by user],
            "shared": [projects shared with user]
        }
    """
    
    # Get owned projects
    owned = db.query(Project).filter(
        Project.owner_id == user_id
    ).offset(skip).limit(limit).all()
    
    # Get shared projects
    shared_project_ids = db.query(ProjectShare.project_id).filter(
        ProjectShare.user_id == user_id
    ).all()
    
    shared_project_ids = [pid[0] for pid in shared_project_ids]
    
    shared = db.query(Project).filter(
        Project.id.in_(shared_project_ids)
    ).all() if shared_project_ids else []
    
    # Attach role information to shared projects
    for project in shared:
        share = db.query(ProjectShare).filter(
            ProjectShare.project_id == project.id,
            ProjectShare.user_id == user_id
        ).first()
        # Add role as attribute (will be serialized in schema)
        project.user_role = share.role if share else None
    
    # Add owner role to owned projects
    for project in owned:
        project.user_role = ProjectRole.OWNER
    
    return {
        "owned": owned,
        "shared": shared
    }


async def log_activity(
    project_id: int,
    user_id: int,
    action: str,
    db: Session,
    details: Optional[dict] = None
):
    """Log project activity for audit trail"""
    from .models import ProjectActivity, ProjectAction
    
    activity = ProjectActivity(
        project_id=project_id,
        user_id=user_id,
        action=ProjectAction(action),
        details=details
    )
    db.add(activity)
    db.commit()
