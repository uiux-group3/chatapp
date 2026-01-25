import os
import datetime
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

# Lightweight schema migration (SQLite)
def _ensure_questions_schema(engine) -> None:
    with engine.begin() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(questions)").fetchall()}
        if "resolved" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE questions ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0"
            )

# Initialize DB
models.Base.metadata.create_all(bind=database.engine)
_ensure_questions_schema(database.engine)

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
    session_id: str

class QuestionCreate(BaseModel):
    author: str
    content: str
    tags: list[str] = []

class QuestionUpdate(BaseModel):
    username: str
    content: str
    tags: list[str] | None = None

class QuestionResolveRequest(BaseModel):
    username: str
    resolved: bool = True

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
    resolved: bool
    reactions: dict[str, int]
    user_reaction: str | None = None
    comment_count: int = 0
    
    class Config:
        from_attributes = True

class CommentCreate(BaseModel):
    author: str
    content: str

class CommentUpdate(BaseModel):
    username: str
    content: str

class CommentResponse(BaseModel):
    id: int
    question_id: int
    author: str
    content: str
    created_at: datetime.datetime
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
    
    # 3. Retrieve Forum Context
    forum_context = get_forum_context(db)

    # Format for Gemini
    gemini_history = []
    
    # Add System/Context Instruction as first part?
    # Or just prepend to history.
    system_instruction = f"""
    You are Q-Chat AI, a helpful teaching assistant.
    Below is the current content of the class forum (questions from other students).
    Use this to inform your answers if relevant (e.g., "someone else asked this...").
    If the user asks about the forum, refer to this data.
    
    === Forum Data ===
    {forum_context}
    ==================
    """
    
    # We can use client.chats.create(..., system_instruction=...) if supported by library version, 
    # or just prepend as a user message that the model "acknowledged" implicitly.
    # Let's try prepending it to the chat history as a "system" context.
    # But for a stateful chat, we might just want to inject it into the prompt if use SDK chat.
    
    # Simple approach: Rebuild history every time with System Prompt at start.
    
    # Note: genai SDK `history` is list of contents.
    # We will treat the forum context as the "system instruction" hidden in the first turn or config.
    # 'gemini-1.5-flash' and '2.0' support system_instruction arg in client.models.generate_content
    # but for `chats.create`, it is passed in `config` or as `history`.
    
    # Let's try passing it as a system instruction via the model config if possible, 
    # OR just prepending it to the user's current message if we want it fresh every time.
    # Prepending to current message is safest for "fresh" context.
    
    chat_input = f"{system_instruction}\n\nUser Query: {request.message}"

    # Reconstruct history EXCLUDING the latest message we just saved (which is request.message)
    # because we are sending `chat_input` which contains request.message.
    # Wait, `history_msgs` includes the `user_msg` we just saved at line 110?
    # Yes, we did db.add and commit.
    
    # So `history_msgs` has [Old1, Old2, ... NewUserMsg].
    # We want `gemini_history` to be [Old1, Old2, ...].
    # And we send `chat_input` (Context + NewUserMsg).
    
    for msg in history_msgs[:-1]:
        gemini_history.append({"role": "user" if msg.role == "user" else "model", "parts": [{"text": msg.content}]})

    try:
        # Note: If we really want "system instruction" behavior that persists, 
        # we can put it in `client.chats.create(..., config=...)`.
        # But injecting into the *current* turn is also fine.
        
        chat = client.chats.create(model=MODEL_NAME, history=gemini_history)
        
        # Send the context + message
        # But wait, if we send `chat_input`, the model will see:
        # User: [Context + Message]
        # Model: Response
        # Next time we load history, we load `ChatMessage` which is just `Message`.
        # So the context is transient for *this generation*, which is good (keeps history clean).
        
        response = chat.send_message(chat_input)
        
        # 3. Save Model Response
        model_msg = models.ChatMessage(session_id=session_id, role="model", content=response.text)
        db.add(model_msg)
        db.commit()
        
        return {"response": response.text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

def get_forum_context(db: Session, limit: int = 10) -> str:
    questions = db.query(models.Question).order_by(models.Question.created_at.desc()).limit(limit).all()
    if not questions:
        return "No questions in the forum yet."
    
    context_lines = []
    for q in questions:
        # Simple format
        status = "Resolved" if getattr(q, "resolved", False) else "Open"
        line = f"QID:{q.id} Status:{status} Author:{q.author} Content:{q.content} (Tags: {', '.join(q.tags) if q.tags else 'None'})"
        context_lines.append(line)
    
    return "\n".join(context_lines)

@app.post("/lecturer/insight")
async def get_lecturer_insight(request: InsightRequest, db: Session = Depends(get_db)):
    if client is None:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")

    session_id = request.session_id

    # Check if session exists, create if not
    db_session = db.query(models.ChatSession).filter(models.ChatSession.session_id == session_id).first()
    if not db_session:
        db_session = models.ChatSession(session_id=session_id, role="lecturer")
        db.add(db_session)
        db.commit()

    # 1. Save Lecturer Message
    lecturer_msg = models.ChatMessage(session_id=session_id, role="user", content=request.query)
    db.add(lecturer_msg)
    db.commit()

    # 2. Retrieve Lecturer Chat History
    history_msgs = db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).order_by(models.ChatMessage.id).all()

    # 3. Retrieve Student Logs (Analysis Target)
    # Exclude lecturer sessions from analysis!
    student_logs = db.query(models.ChatMessage).join(models.ChatSession).filter(models.ChatSession.role == "student").order_by(models.ChatMessage.session_id, models.ChatMessage.id).all()
    
    student_log_text = ""
    current_session = ""
    for msg in student_logs:
        if msg.session_id != current_session:
            student_log_text += f"\n--- Student Session {msg.session_id} ---\n"
            current_session = msg.session_id
        student_log_text += f"{msg.role}: {msg.content}\n"

    if not student_log_text:
        student_log_text = "(No student chat logs available yet.)"

    # 4. Retrieve Forum Context
    forum_context = get_forum_context(db, limit=20)

    # 5. Construct System/Context Prompt
    prompt_context = f"""
    You are a university lecturer's intelligent assistant "Class AI" for Insight Analysis.
    
    Your goal is to help the lecturer understand how students are doing based on two data sources:
    1. Student Chat Logs (Private 1:1 sessions with AI)
    2. Class Forum (Public questions posted by students)

    [PRIVACY]: Do NOT quote specific messages or IDs unless necessary for context.
    Summarize trends, confusion points, and suggest actions.
    Answer in Japanese.

    === Class Data Sources ===
    
    [Source A: Student Chat Logs]
    {student_log_text}
    
    [Source B: Forum Questions]
    {forum_context}
    
    ==========================
    """
    
    # Construct Chat Input (Context + User Query)
    chat_input = f"{prompt_context}\n\nLecturer Query: {request.query}"

    # 6. Build Gemini History
    gemini_history = []
    # Exclude the latest message (request.query) which is in chat_input
    for msg in history_msgs[:-1]:
         gemini_history.append({"role": "user" if msg.role == "user" else "model", "parts": [{"text": msg.content}]})
    
    try:
        chat = client.chats.create(
            model=MODEL_NAME,
            history=gemini_history
        )
        response = chat.send_message(chat_input)
        
        # 7. Save Model Response
        model_msg = models.ChatMessage(session_id=session_id, role="model", content=response.text)
        db.add(model_msg)
        db.commit()
        
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
        comment_count = db.query(models.QuestionComment).filter(models.QuestionComment.question_id == q.id).count()
        
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
            "resolved": q.resolved,
            "reactions": reaction_counts,
            "user_reaction": user_reaction,
            "comment_count": comment_count,
        })
    return result

@app.get("/questions/{question_id}", response_model=QuestionResponse)
def get_question(question_id: int, username: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    user_id = None
    if username:
        user = db.query(models.User).filter(models.User.username == username).first()
        if user:
            user_id = user.id

    reactions_query = db.query(models.QuestionReaction).filter(models.QuestionReaction.question_id == q.id).all()
    comment_count = db.query(models.QuestionComment).filter(models.QuestionComment.question_id == q.id).count()

    reaction_counts: dict[str, int] = {}
    user_reaction: str | None = None
    for r in reactions_query:
        reaction_counts[r.reaction_type] = reaction_counts.get(r.reaction_type, 0) + 1
        if user_id and r.user_id == user_id:
            user_reaction = r.reaction_type

    return {
        "id": q.id,
        "author": q.author,
        "content": q.content,
        "tags": q.tags,
        "likes": q.likes,
        "resolved": q.resolved,
        "reactions": reaction_counts,
        "user_reaction": user_reaction,
        "comment_count": comment_count,
    }

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
        "resolved": db_question.resolved,
        "reactions": {},
        "user_reaction": None,
        "comment_count": 0,
    }

@app.put("/questions/{question_id}/resolve", response_model=QuestionResponse)
def resolve_question(question_id: int, payload: QuestionResolveRequest, db: Session = Depends(get_db)):
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if q.author != username:
        raise HTTPException(status_code=403, detail="You can only resolve your own posts")

    q.resolved = bool(payload.resolved)
    db.commit()

    user = db.query(models.User).filter(models.User.username == username).first()
    user_id = user.id if user else None
    reactions_query = db.query(models.QuestionReaction).filter(models.QuestionReaction.question_id == q.id).all()
    comment_count = db.query(models.QuestionComment).filter(models.QuestionComment.question_id == q.id).count()

    reaction_counts: dict[str, int] = {}
    user_reaction: str | None = None
    for r in reactions_query:
        reaction_counts[r.reaction_type] = reaction_counts.get(r.reaction_type, 0) + 1
        if user_id and r.user_id == user_id:
            user_reaction = r.reaction_type

    return {
        "id": q.id,
        "author": q.author,
        "content": q.content,
        "tags": q.tags,
        "likes": q.likes,
        "resolved": q.resolved,
        "reactions": reaction_counts,
        "user_reaction": user_reaction,
        "comment_count": comment_count,
    }

@app.put("/questions/{question_id}", response_model=QuestionResponse)
def update_question(question_id: int, payload: QuestionUpdate, db: Session = Depends(get_db)):
    username = payload.username.strip()
    content = payload.content.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if q.author != username:
        raise HTTPException(status_code=403, detail="You can only edit your own posts")

    q.content = content
    if payload.tags is not None:
        q.tags = payload.tags
    db.commit()

    user = db.query(models.User).filter(models.User.username == username).first()
    user_id = user.id if user else None
    reactions_query = db.query(models.QuestionReaction).filter(models.QuestionReaction.question_id == q.id).all()
    comment_count = db.query(models.QuestionComment).filter(models.QuestionComment.question_id == q.id).count()

    reaction_counts: dict[str, int] = {}
    user_reaction: str | None = None
    for r in reactions_query:
        reaction_counts[r.reaction_type] = reaction_counts.get(r.reaction_type, 0) + 1
        if user_id and r.user_id == user_id:
            user_reaction = r.reaction_type

    return {
        "id": q.id,
        "author": q.author,
        "content": q.content,
        "tags": q.tags,
        "likes": q.likes,
        "resolved": q.resolved,
        "reactions": reaction_counts,
        "user_reaction": user_reaction,
        "comment_count": comment_count,
    }

@app.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    username: str,
    role: str = "student",
    db: Session = Depends(get_db),
):
    username = username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    is_lecturer = role.strip().lower() == "lecturer"
    if (not is_lecturer) and (q.author != username):
        raise HTTPException(status_code=403, detail="You can only delete your own posts")

    db.query(models.QuestionReaction).filter(models.QuestionReaction.question_id == question_id).delete(synchronize_session=False)
    comment_ids = [cid for (cid,) in db.query(models.QuestionComment.id).filter(models.QuestionComment.question_id == question_id).all()]
    if comment_ids:
        db.query(models.CommentReaction).filter(models.CommentReaction.comment_id.in_(comment_ids)).delete(synchronize_session=False)
    db.query(models.QuestionComment).filter(models.QuestionComment.question_id == question_id).delete(synchronize_session=False)
    db.delete(q)
    db.commit()
    return {"status": "deleted"}

@app.get("/questions/{question_id}/comments", response_model=list[CommentResponse])
def get_comments(question_id: int, username: str | None = None, db: Session = Depends(get_db)):
    exists = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Question not found")

    user_id = None
    if username:
        user = db.query(models.User).filter(models.User.username == username).first()
        if user:
            user_id = user.id

    comments = (
        db.query(models.QuestionComment)
        .filter(models.QuestionComment.question_id == question_id)
        .order_by(models.QuestionComment.created_at.asc(), models.QuestionComment.id.asc())
        .all()
    )

    result = []
    for c in comments:
        reactions_query = db.query(models.CommentReaction).filter(models.CommentReaction.comment_id == c.id).all()
        reaction_counts: dict[str, int] = {}
        user_reaction: str | None = None
        for r in reactions_query:
            reaction_counts[r.reaction_type] = reaction_counts.get(r.reaction_type, 0) + 1
            if user_id and r.user_id == user_id:
                user_reaction = r.reaction_type

        result.append({
            "id": c.id,
            "question_id": c.question_id,
            "author": c.author,
            "content": c.content,
            "created_at": c.created_at,
            "reactions": reaction_counts,
            "user_reaction": user_reaction,
        })

    return result

@app.post("/questions/{question_id}/comments", response_model=CommentResponse)
def create_comment(question_id: int, comment: CommentCreate, db: Session = Depends(get_db)):
    author = comment.author.strip()
    content = comment.content.strip()
    if not author:
        raise HTTPException(status_code=400, detail="Author cannot be empty")
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    db_comment = models.QuestionComment(question_id=question_id, author=author, content=content)
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return {
        "id": db_comment.id,
        "question_id": db_comment.question_id,
        "author": db_comment.author,
        "content": db_comment.content,
        "created_at": db_comment.created_at,
        "reactions": {},
        "user_reaction": None,
    }

@app.put("/comments/{comment_id}", response_model=CommentResponse)
def update_comment(comment_id: int, payload: CommentUpdate, db: Session = Depends(get_db)):
    username = payload.username.strip()
    content = payload.content.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    c = db.query(models.QuestionComment).filter(models.QuestionComment.id == comment_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.author != username:
        raise HTTPException(status_code=403, detail="You can only edit your own comments")

    c.content = content
    db.commit()

    user = db.query(models.User).filter(models.User.username == username).first()
    user_id = user.id if user else None
    reactions_query = db.query(models.CommentReaction).filter(models.CommentReaction.comment_id == c.id).all()
    reaction_counts: dict[str, int] = {}
    user_reaction: str | None = None
    for r in reactions_query:
        reaction_counts[r.reaction_type] = reaction_counts.get(r.reaction_type, 0) + 1
        if user_id and r.user_id == user_id:
            user_reaction = r.reaction_type

    return {
        "id": c.id,
        "question_id": c.question_id,
        "author": c.author,
        "content": c.content,
        "created_at": c.created_at,
        "reactions": reaction_counts,
        "user_reaction": user_reaction,
    }

@app.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    username: str,
    role: str = "student",
    db: Session = Depends(get_db),
):
    username = username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    c = db.query(models.QuestionComment).filter(models.QuestionComment.id == comment_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")

    is_lecturer = role.strip().lower() == "lecturer"
    if (not is_lecturer) and (c.author != username):
        raise HTTPException(status_code=403, detail="You can only delete your own comments")

    db.query(models.CommentReaction).filter(models.CommentReaction.comment_id == comment_id).delete(synchronize_session=False)
    db.delete(c)
    db.commit()
    return {"status": "deleted"}

@app.post("/comments/{comment_id}/react")
def react_to_comment(comment_id: int, req: ReactionRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == req.username).first()
    if not user:
        user = models.User(username=req.username)
        db.add(user)
        db.commit()
        db.refresh(user)

    comment = db.query(models.QuestionComment).filter(models.QuestionComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    existing = db.query(models.CommentReaction).filter(
        models.CommentReaction.comment_id == comment_id,
        models.CommentReaction.user_id == user.id
    ).first()

    if existing:
        if existing.reaction_type == req.reaction_type:
            db.delete(existing)
            db.commit()
            return {"status": "removed"}
        else:
            existing.reaction_type = req.reaction_type
            db.commit()
            return {"status": "updated"}
    else:
        new_reaction = models.CommentReaction(
            comment_id=comment_id,
            user_id=user.id,
            reaction_type=req.reaction_type
        )
        db.add(new_reaction)
        db.commit()
        return {"status": "added"}

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
