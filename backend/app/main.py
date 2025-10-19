from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
import os
from dotenv import load_dotenv
from .routers import auth, projects, sharing, ai, export_pdf
from .database import engine, Base
from .socket_handler import sio

# Load environment variables
load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(sharing.router)
app.include_router(ai.router)
app.include_router(export_pdf.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Creative Canvas AI"}

# Mount Socket.IO with FastAPI
# The socket_app wraps both the Socket.IO server and FastAPI
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path='socket.io')
