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
