from fastapi import FastAPI
from .routers import auth, projects
from .database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(auth.router)
app.include_router(projects.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Creative Canvas AI"}
