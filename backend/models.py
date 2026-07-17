from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from database import Base
import datetime
import uuid

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    chess_com_username = Column(String, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    games = relationship("Game", back_populates="user")

class Game(Base):
    __tablename__ = "games"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, ForeignKey("users.id"))
    url = Column(String, unique=True)
    pgn = Column(Text)
    white = Column(String)
    black = Column(String)
    white_rating = Column(Integer)
    black_rating = Column(Integer)
    result = Column(String)
    time_control = Column(String)
    time_class = Column(String)
    end_time = Column(DateTime)
    opening_name = Column(String, nullable=True)
    opening_eco = Column(String, nullable=True)
    moves_list = Column(Text, nullable=True)
    
    # Engine Evaluation
    blunders = Column(Integer, default=0)
    mistakes = Column(Integer, default=0)
    inaccuracies = Column(Integer, default=0)
    accuracy = Column(Float, nullable=True)
    evaluations_list = Column(Text, nullable=True) # JSON list of move-by-move evals
    
    user = relationship("User", back_populates="games")

class TrainingLog(Base):
    __tablename__ = "training_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    date = Column(DateTime, default=datetime.datetime.utcnow)
    completed = Column(Boolean, default=True)
    puzzles_solved = Column(Integer, default=0)
    time_spent_minutes = Column(Integer, default=0)
    
    user = relationship("User")
