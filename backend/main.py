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

class ReactionRequest(BaseModel):
    username: str
    reaction_type: str

class QuestionResponse(BaseModel):
    id: int
    author: str
    content: str
    tags: list[str]
    likes: int # Keep for backward compat
    reactions: dict[str, int]
    user_reaction: str | None = None
    
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
def get_questions(username: str | None = None, db: Session = Depends(get_db)):
    questions = db.query(models.Question).order_by(models.Question.created_at.desc()).all()
    
    # Get user if username provided
    user_id = None
    if username:
        user = db.query(models.User).filter(models.User.username == username).first()
        if user:
            user_id = user.id

    result = []
    for q in questions:
        # Count reactions
        # This is N+1 query problem potential but fine for prototype scale
        reactions_query = db.query(models.QuestionReaction).filter(models.QuestionReaction.question_id == q.id).all()
        
        reaction_counts = {}
        user_reaction = None
        
        for r in reactions_query:
            reaction_counts[r.reaction_type] = reaction_counts.get(r.reaction_type, 0) + 1
            if user_id and r.user_id == user_id:
                user_reaction = r.reaction_type
        
        result.append({
            "id": q.id,
            "author": q.author,
            "content": q.content,
            "tags": q.tags,
            "likes": q.likes,
            "reactions": reaction_counts,
            "user_reaction": user_reaction
        })
    return result

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
    return {
        "id": db_question.id,
        "author": db_question.author,
        "content": db_question.content,
        "tags": db_question.tags,
        "likes": 0,
        "reactions": {},
        "user_reaction": None
    }

@app.post("/questions/{question_id}/react")
def react_to_question(question_id: int, req: ReactionRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == req.username).first()
    if not user:
         # Auto-create user if not exists (Robustness for prototype)
         user = models.User(username=req.username)
         db.add(user)
         db.commit()
         db.refresh(user)

    # Check existing reaction
    existing = db.query(models.QuestionReaction).filter(
        models.QuestionReaction.question_id == question_id,
        models.QuestionReaction.user_id == user.id
    ).first()

    if existing:
        if existing.reaction_type == req.reaction_type:
            # Toggle off
            db.delete(existing)
            db.commit()
            return {"status": "removed"}
        else:
            # Change reaction
            existing.reaction_type = req.reaction_type
            db.commit()
            return {"status": "updated"}
    else:
        # Create new
        new_reaction = models.QuestionReaction(
             question_id=question_id,
             user_id=user.id,
             reaction_type=req.reaction_type
        )
        db.add(new_reaction)
        db.commit()
        return {"status": "added"}
