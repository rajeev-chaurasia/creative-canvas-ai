from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
import secrets

from .. import schemas, models
from ..database import get_db
from ..permissions import require_permission, get_user_role, log_activity, can_access_via_link
from .auth import get_current_user

router = APIRouter(
    prefix="/api/projects",
    tags=["sharing"],
    dependencies=[Depends(get_current_user)]
)


@router.post("/{project_uuid}/share", response_model=schemas.ShareInviteResponse)
async def share_project(
    project_uuid: str,
    share_data: schemas.ProjectShareCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Share a project with another user by email.
    Creates ProjectShare if user exists, or ShareInvite if they don't.
    """
    
    # Check permission (must have share permission)
    project = await require_permission(project_uuid, current_user.id, db, "share")
    
    # Validate role
    if share_data.role not in ["editor", "viewer"]:
        raise HTTPException(status_code=400, detail="Role must be 'editor' or 'viewer'")
    
    # Check if inviting self
    if share_data.email == current_user.email:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")
    
    # Check if user exists
    invited_user = db.query(models.User).filter(
        models.User.email == share_data.email
    ).first()
    
    if invited_user:
        # User exists - create ProjectShare directly
        
        # Check if already shared
        existing_share = db.query(models.ProjectShare).filter(
            models.ProjectShare.project_id == project.id,
            models.ProjectShare.user_id == invited_user.id
        ).first()
        
        if existing_share:
            # Update role if different
            if existing_share.role.value != share_data.role:
                existing_share.role = models.ProjectRole(share_data.role)
                db.commit()
                message = f"Updated {share_data.email}'s role to {share_data.role}"
            else:
                message = f"{share_data.email} already has {share_data.role} access"
            
            return schemas.ShareInviteResponse(
                share_id=existing_share.id,
                invite_sent=False,
                message=message
            )
        
        # Create new share
        new_share = models.ProjectShare(
            project_id=project.id,
            user_id=invited_user.id,
            role=models.ProjectRole(share_data.role),
            invited_by=current_user.id,
            accepted_at=datetime.now()  # Auto-accept for existing users
        )
        db.add(new_share)
        db.commit()
        db.refresh(new_share)
        
        # Log activity
        await log_activity(
            project_id=project.id,
            user_id=current_user.id,
            action="shared",
            db=db,
            details={
                "shared_with": share_data.email,
                "role": share_data.role
            }
        )
        
        # TODO: Send notification email to invited_user
        
        return schemas.ShareInviteResponse(
            share_id=new_share.id,
            invite_sent=True,
            message=f"Shared with {share_data.email}"
        )
    
    else:
        # User doesn't exist - create ShareInvite
        
        # Check if invite already exists
        existing_invite = db.query(models.ShareInvite).filter(
            models.ShareInvite.project_id == project.id,
            models.ShareInvite.email == share_data.email,
            models.ShareInvite.accepted == False
        ).first()
        
        if existing_invite:
            return schemas.ShareInviteResponse(
                invite_sent=True,
                invite_token=existing_invite.token,
                message=f"Invite already sent to {share_data.email}"
            )
        
        # Create new invite
        invite_token = secrets.token_urlsafe(32)
        
        new_invite = models.ShareInvite(
            project_id=project.id,
            email=share_data.email,
            role=models.ProjectRole(share_data.role),
            token=invite_token,
            invited_by=current_user.id,
            expires_at=datetime.now() + timedelta(days=7)
        )
        db.add(new_invite)
        db.commit()
        db.refresh(new_invite)
        
        # TODO: Send invite email
        
        return schemas.ShareInviteResponse(
            invite_sent=True,
            invite_token=invite_token,
            message=f"Invite sent to {share_data.email}"
        )


@router.get("/{project_uuid}/shares")
async def get_project_shares(
    project_uuid: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all users who have access to this project"""
    
    # Check permission
    project = await require_permission(project_uuid, current_user.id, db, "view")
    
    # Get all shares
    shares = db.query(models.ProjectShare).filter(
        models.ProjectShare.project_id == project.id
    ).all()
    
    # Format response
    users = []
    for share in shares:
        user_info = {
            "user_id": share.user_id,
            "name": share.user.full_name,
            "email": share.user.email,
            "role": share.role.value,
            "invited_at": share.invited_at,
            "accepted_at": share.accepted_at
        }
        users.append(user_info)
    
    # Add owner
    owner_info = {
        "user_id": project.owner_id,
        "name": project.owner.full_name,
        "email": project.owner.email,
        "role": "owner",
        "invited_at": project.created_at,
        "accepted_at": project.created_at
    }
    users.insert(0, owner_info)
    
    # Get pending invites
    pending_invites = db.query(models.ShareInvite).filter(
        models.ShareInvite.project_id == project.id,
        models.ShareInvite.accepted == False,
        models.ShareInvite.expires_at > datetime.now()
    ).all()
    
    pending = [
        {
            "email": invite.email,
            "role": invite.role.value,
            "invited_at": invite.invited_at,
            "expires_at": invite.expires_at
        }
        for invite in pending_invites
    ]
    
    return {
        "users": users,
        "pending_invites": pending
    }


@router.patch("/{project_uuid}/shares/{user_id}", response_model=schemas.ProjectShareInfo)
async def update_user_role(
    project_uuid: str,
    user_id: int,
    update_data: schemas.ProjectShareUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update a user's role in a project (owner only)"""
    
    # Check permission (must be owner)
    project = await require_permission(project_uuid, current_user.id, db, "manage")
    
    # Validate role
    if update_data.role not in ["editor", "viewer"]:
        raise HTTPException(status_code=400, detail="Role must be 'editor' or 'viewer'")
    
    # Cannot change owner's role
    if user_id == project.owner_id:
        raise HTTPException(status_code=400, detail="Cannot change owner's role")
    
    # Find share
    share = db.query(models.ProjectShare).filter(
        models.ProjectShare.project_id == project.id,
        models.ProjectShare.user_id == user_id
    ).first()
    
    if not share:
        raise HTTPException(status_code=404, detail="User not found in project")
    
    # Update role
    share.role = models.ProjectRole(update_data.role)
    db.commit()
    db.refresh(share)
    
    return schemas.ProjectShareInfo(
        user_id=share.user_id,
        name=share.user.full_name,
        email=share.user.email,
        role=share.role.value,
        invited_at=share.invited_at,
        accepted_at=share.accepted_at
    )


@router.delete("/{project_uuid}/shares/{user_id}")
async def remove_user_from_project(
    project_uuid: str,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Remove a user from a project (owner only)"""
    
    # Check permission (must be owner)
    project = await require_permission(project_uuid, current_user.id, db, "manage")
    
    # Cannot remove owner
    if user_id == project.owner_id:
        raise HTTPException(status_code=400, detail="Cannot remove project owner")
    
    # Find and delete share
    share = db.query(models.ProjectShare).filter(
        models.ProjectShare.project_id == project.id,
        models.ProjectShare.user_id == user_id
    ).first()
    
    if not share:
        raise HTTPException(status_code=404, detail="User not found in project")
    
    db.delete(share)
    db.commit()
    
    return {"message": "User removed from project"}


@router.post("/invites/{token}/accept")
async def accept_invite(
    token: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Accept a project invite"""
    
    # Find invite
    invite = db.query(models.ShareInvite).filter(
        models.ShareInvite.token == token,
        models.ShareInvite.accepted == False
    ).first()
    
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or already accepted invite")
    
    # Check expiry
    if invite.expires_at < datetime.now():
        raise HTTPException(status_code=410, detail="Invite has expired")
    
    # Check email match
    if invite.email != current_user.email:
        raise HTTPException(
            status_code=403, 
            detail="This invite is for a different email address"
        )
    
    # Check if user already has access
    existing_share = db.query(models.ProjectShare).filter(
        models.ProjectShare.project_id == invite.project_id,
        models.ProjectShare.user_id == current_user.id
    ).first()
    
    if existing_share:
        invite.accepted = True
        db.commit()
        return {
            "message": "You already have access to this project",
            "project_uuid": invite.project.uuid
        }
    
    # Create project share
    new_share = models.ProjectShare(
        project_id=invite.project_id,
        user_id=current_user.id,
        role=invite.role,
        invited_by=invite.invited_by,
        accepted_at=datetime.now()
    )
    db.add(new_share)
    
    # Mark invite as accepted
    invite.accepted = True
    
    db.commit()
    
    # Log activity
    await log_activity(
        project_id=invite.project_id,
        user_id=current_user.id,
        action="joined",
        db=db,
        details={"via_invite": True}
    )
    
    return {
        "message": "Invite accepted successfully",
        "project_uuid": invite.project.uuid,
        "redirect_url": f"/canvas/{invite.project.uuid}"
    }


@router.post("/{project_uuid}/generate-link")
async def generate_public_link(
    project_uuid: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Generate a public shareable link for this project (owner/editor only)"""
    
    # Check permission (must be owner or editor)
    project = await require_permission(project_uuid, current_user.id, db, "share")
    
    # Generate or use existing token
    if not project.public_share_token:
        project.public_share_token = secrets.token_urlsafe(32)
        db.commit()
        db.refresh(project)
        
        # Log activity
        await log_activity(
            project_id=project.id,
            user_id=current_user.id,
            action="shared",
            db=db,
            details={"type": "public_link_generated"}
        )
    
    return {
        "message": "Public link generated",
        "public_share_token": project.public_share_token,
        "share_url": f"/canvas/{project_uuid}?share_token={project.public_share_token}"
    }


@router.post("/{project_uuid}/disable-link")
async def disable_public_link(
    project_uuid: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Disable public link sharing (owner only)"""
    
    # Check permission (must be owner/editor)
    project = await require_permission(project_uuid, current_user.id, db, "share")
    
    if not project.public_share_token:
        return {"message": "No public link was active"}
    
    project.public_share_token = None
    db.commit()
    
    # Log activity
    await log_activity(
        project_id=project.id,
        user_id=current_user.id,
        action="shared",
        db=db,
        details={"type": "public_link_disabled"}
    )
    
    return {"message": "Public link disabled"}


@router.post("/{project_uuid}/auto-join-via-link")
async def auto_join_via_link(
    project_uuid: str,
    share_token: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Auto-add authenticated user to project after accessing via link (like Google Docs)"""
    
    # Validate link access
    has_link_access = await can_access_via_link(project_uuid, share_token, db)
    if not has_link_access:
        raise HTTPException(status_code=403, detail="Invalid share token")
    
    # Get project
    project = db.query(models.Project).filter(
        models.Project.uuid == project_uuid
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if user already has access (owner or in ProjectShare)
    user_role = await get_user_role(project_uuid, current_user.id, db)
    if user_role is not None:
        # User already has access, just return the project
        return {
            "message": "Already have access to this project",
            "project_uuid": project_uuid,
            "role": user_role.value if user_role else None
        }
    
    # Auto-add as viewer
    new_share = models.ProjectShare(
        project_id=project.id,
        user_id=current_user.id,
        role=models.ProjectRole.VIEWER,
        invited_by=project.owner_id,  # Owner is the one who "invited" via link
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
    
    return {
        "message": "Successfully added to project as viewer",
        "project_uuid": project_uuid,
        "role": "viewer"
    }

