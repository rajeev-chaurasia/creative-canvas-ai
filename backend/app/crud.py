from sqlalchemy.orm import Session
from . import models, schemas

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_google_id(db: Session, google_id: str):
    return db.query(models.User).filter(models.User.google_id == google_id).first()

def create_user(db: Session, user: schemas.UserCreate):
    db_user = models.User(email=user.email, google_id=user.google_id, full_name=user.full_name)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_projects(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Project).filter(models.Project.owner_id == user_id).offset(skip).limit(limit).all()

def create_user_project(db: Session, project: schemas.ProjectCreate, user_id: int):
    db_project = models.Project(**project.dict(), owner_id=user_id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def create_guest_project(db: Session, project: schemas.ProjectCreate, guest_id: str, expires_at=None):
    db_project = models.Project(**project.dict(), owner_id=None, guest_id=guest_id, guest_expires_at=expires_at)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def update_guest_project(db: Session, project_uuid: str, project: schemas.ProjectUpdate, guest_id: str):
    db_project = db.query(models.Project).filter(models.Project.uuid == project_uuid, models.Project.guest_id == guest_id).first()
    if not db_project:
        return None

    update_data = project.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def get_guest_projects(db: Session, guest_id: str):
    return db.query(models.Project).filter(models.Project.guest_id == guest_id).all()

def get_guest_project(db: Session, project_uuid: str, guest_id: str):
    """Get a specific guest project by UUID and guest_id."""
    return db.query(models.Project).filter(
        models.Project.uuid == project_uuid,
        models.Project.guest_id == guest_id
    ).first()

def claim_guest_projects(db: Session, guest_id: str, user_id: int, project_uuids: list | None = None):
    query = db.query(models.Project).filter(models.Project.guest_id == guest_id)
    if project_uuids:
        query = query.filter(models.Project.uuid.in_(project_uuids))
    projects = query.all()
    for p in projects:
        p.owner_id = user_id
        p.guest_id = None
        p.guest_expires_at = None
        db.add(p)
    db.commit()
    return projects
