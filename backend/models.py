from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, PickleType
from sqlalchemy.orm import relationship
import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    author = Column(String, default="Anonymous")
    content = Column(String)
    tags = Column(PickleType, default=[]) 
    likes = Column(Integer, default=0) # Deprecated but kept for compatibility
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class QuestionReaction(Base):
    __tablename__ = "question_reactions"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    reaction_type = Column(String) # like, insightful, curious, funny


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    session_id = Column(String, primary_key=True, index=True)
    role = Column(String) # student, lecturer
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("chat_sessions.session_id"))
    role = Column(String) # user, model
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
