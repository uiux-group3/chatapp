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
    tags = Column(PickleType, default=[]) # Storing list as pickle or JSON string. Pickle is easier for lists but careful with security. For this app it's fine or use comma separated string. Let's use PickelType for simplicity with lists.
    likes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

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
