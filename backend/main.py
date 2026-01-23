import os
from google import genai
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models, database

load_dotenv()

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
MODEL_NAME = 'gemini-2.5-flash'

# Initialize DB
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Models
class ChatRequest(BaseModel):
    session_id: str
    message: str

class InsightRequest(BaseModel):
    query: str

class QuestionCreate(BaseModel):
    author: str
    content: str
    tags: list[str] = []

class UserLogin(BaseModel):
    username: str

class UserResponse(BaseModel):
    id: int
    username: str
    
    class Config:
        from_attributes = True

class QuestionResponse(BaseModel):
    id: int
    author: str
    content: str
    tags: list[str]
    likes: int
    
    class Config:
        from_attributes = True

@app.get("/")
def read_root():
    return {"Hello": "World", "Service": "Question Chat App (Persistent)"}

@app.post("/login", response_model=UserResponse)
def login(login_req: UserLogin, db: Session = Depends(get_db)):
    username = login_req.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
        
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        user = models.User(username=username)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user

@app.get("/chat/history")
def get_chat_history(session_id: str, db: Session = Depends(get_db)):
    return db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).order_by(models.ChatMessage.id).all()

@app.post("/chat")
async def chat_with_ai(request: ChatRequest, db: Session = Depends(get_db)):
    if client is None:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")

    session_id = request.session_id
    
    # Check if session exists, create if not
    db_session = db.query(models.ChatSession).filter(models.ChatSession.session_id == session_id).first()
    if not db_session:
        db_session = models.ChatSession(session_id=session_id, role="student") # Default to student for now since UI generates ID
        db.add(db_session)
        db.commit()

    # 1. Save User Message
    user_msg = models.ChatMessage(session_id=session_id, role="user", content=request.message)
    db.add(user_msg)
    db.commit()

    # 2. Retrieve History
    # Limit history to last 10 turns? Or full history. Let's do last 20 messages.
    history_msgs = db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).order_by(models.ChatMessage.id).all()
    
    # Format for Gemini
    # construct history for API (excluding the one we just added to send as 'message'?)
    # genai SDK usually takes history as list of contents.
    gemini_history = []
    # We need to pass previous messages
    for msg in history_msgs[:-1]:
        gemini_history.append({"role": "user" if msg.role == "user" else "model", "parts": [{"text": msg.content}]})

    try:
        chat = client.chats.create(model=MODEL_NAME, history=gemini_history)
        response = chat.send_message(request.message)
        
        # 3. Save Model Response
        model_msg = models.ChatMessage(session_id=session_id, role="model", content=response.text)
        db.add(model_msg)
        db.commit()
        
        return {"response": response.text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/lecturer/insight")
async def get_lecturer_insight(request: InsightRequest, db: Session = Depends(get_db)):
    if client is None:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")

    # Aggregate logs
    all_msgs = db.query(models.ChatMessage).order_by(models.ChatMessage.session_id, models.ChatMessage.id).all()
    
    if not all_msgs:
         return {"response": "No chat logs available."}

    text_logs = ""
    current_session = ""
    for msg in all_msgs:
        if msg.session_id != current_session:
            text_logs += f"\n--- Session {msg.session_id} ---\n"
            current_session = msg.session_id
        text_logs += f"{msg.role}: {msg.content}\n"

    prompt = f"""
    You are a university lecturer's assistant.
    Analyze the following anonymized student chat logs to find what they are struggling with.
    
    [PRIVACY]: Do NOT quote specific messages or ID.
    Summarize trends and confusion points.
    Answer in Japanese.
    
    Lecturer Query: {request.query}
    
    --- Logs ---
    {text_logs}
    """
    
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt
        )
        return {"response": response.text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Forum Endpoints
@app.get("/questions", response_model=list[QuestionResponse])
def get_questions(db: Session = Depends(get_db)):
    return db.query(models.Question).order_by(models.Question.created_at.desc()).all()

@app.post("/questions", response_model=QuestionResponse)
def create_question(question: QuestionCreate, db: Session = Depends(get_db)):
    db_question = models.Question(
        author=question.author,
        content=question.content,
        tags=question.tags
    )
    db.add(db_question)
    db.commit()
    db.refresh(db_question)
    return db_question
