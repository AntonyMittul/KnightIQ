from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import users, coach
import models

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Chess Performance Analyzer API",
    description="Backend API for processing chess games and AI coaching.",
    version="1.0.0"
)

# CORS config
origins = [
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(coach.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the AI Chess Performance Analyzer API!"}
