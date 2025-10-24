from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import uuid
import enum

class ProjectRole(str, enum.Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"

class ProjectAction(str, enum.Enum):
    CREATED = "created"
    EDITED = "edited"
    SHARED = "shared"
    DELETED = "deleted"
    RENAMED = "renamed"
    JOINED = "joined"
    LEFT = "left"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255))
    google_id = Column(String(255), unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    projects = relationship("Project", back_populates="owner", foreign_keys="[Project.owner_id]")
    project_shares = relationship("ProjectShare", back_populates="user", foreign_keys="[ProjectShare.user_id]")
    sent_invites = relationship("ShareInvite", back_populates="inviter", foreign_keys="[ShareInvite.invited_by]")

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), index=True)
    canvas_state = Column(JSON)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Guest-related fields: if a project was created by an unauthenticated guest
    # it will have `guest_id` set and `owner_id` will be null until claimed.
    guest_id = Column(String(64), nullable=True, index=True)
    guest_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    public_share_token = Column(String(64), unique=True, nullable=True, index=True)

    # Relationships
    owner = relationship("User", back_populates="projects", foreign_keys=[owner_id])
    shares = relationship("ProjectShare", back_populates="project", cascade="all, delete-orphan")
    invites = relationship("ShareInvite", back_populates="project", cascade="all, delete-orphan")
    activities = relationship("ProjectActivity", back_populates="project", cascade="all, delete-orphan")

class ProjectShare(Base):
    __tablename__ = "project_shares"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(ProjectRole), default=ProjectRole.VIEWER, nullable=False)
    invited_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    invited_at = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="shares")
    user = relationship("User", back_populates="project_shares", foreign_keys=[user_id])
    inviter = relationship("User", foreign_keys=[invited_by])

class ShareInvite(Base):
    __tablename__ = "share_invites"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    role = Column(Enum(ProjectRole), default=ProjectRole.VIEWER, nullable=False)
    token = Column(String(64), unique=True, nullable=False, index=True)
    invited_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    invited_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted = Column(Boolean, default=False, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="invites")
    inviter = relationship("User", back_populates="sent_invites", foreign_keys=[invited_by])

class ProjectActivity(Base):
    __tablename__ = "project_activities"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action = Column(Enum(ProjectAction), nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", back_populates="activities")
    user = relationship("User")
