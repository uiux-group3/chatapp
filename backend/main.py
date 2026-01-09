import os
import google.generativeai as genai
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-2.5-flash')

app = FastAPI()

# CORS config for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for prototype
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock Database
class MockDB:
    def __init__(self):
        self.chat_histories = {} # {session_id: [messages]}
        
    def add_message(self, session_id: str, role: str, content: str):
        if session_id not in self.chat_histories:
            self.chat_histories[session_id] = []
        parsed_role = "user" if role == "user" else "model"
        self.chat_histories[session_id].append({"role": parsed_role, "parts": [content]})
    
    def get_history(self, session_id: str):
        return self.chat_histories.get(session_id, [])

    def get_all_logs_as_text(self):
        text = ""
        for session_id, history in self.chat_histories.items():
            text += f"--- Session {session_id} ---\n"
            for msg in history:
                text += f"{msg['role']}: {msg['parts'][0]}\n"
        return text

db = MockDB()

class ChatRequest(BaseModel):
    session_id: str
    message: str

class InsightRequest(BaseModel):
    query: str

class Question(BaseModel):
    content: str
    tags: list[str] = []

@app.get("/")
def read_root():
    return {"Hello": "World", "Service": "Question Chat App"}

@app.post("/chat")
async def chat_with_ai(request: ChatRequest):
    # Determine context (placeholder for now)
    # In real app, this would query relevant public threads too
    
    # 1. Add user message to history
    db.add_message(request.session_id, "user", request.message)
    
    # 2. Get history for API
    history = db.get_history(request.session_id)
    
    try:
        # Create chat session with history
        chat = model.start_chat(history=history[:-1]) # history minus current message
        response = chat.send_message(request.message)
        
        # 3. Add model response to history
        db.add_message(request.session_id, "model", response.text)
        
        return {"response": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/lecturer/insight")
async def get_lecturer_insight(request: InsightRequest):
    # 1. Aggregate all student logs (Raw text) - HIDDEN from Lecturer, seen by AI
    all_logs = db.get_all_logs_as_text()
    
    if not all_logs:
        return {"response": "分析対象となる学生のチャット履歴がまだありません。"}

    # 2. Construct Prompt
    prompt = f"""
    あなたは大学の講師のアシスタントです。
    講師は、学生が「プライベートAIチャット」でどのような質問をしているかを元に、学生がつまずいている点を知りたいと考えています。
    
    【プライバシー絶対厳守】: 特定のメッセージを引用したり、学生個人を特定するような情報は絶対に出力しないでください（セッションIDが見えていても無視してください）。
    「傾向」や「よくある混乱ポイント」を要約し、講師が授業で再度解説すべき点を提案してください。
    回答は日本語で行ってください。
    
    講師からの質問: {request.query}
    
    --- 匿名化された学生チャットログ ---
    {all_logs}
    """
    
    try:
        response = model.generate_content(prompt)
        return {"response": response.text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR in /chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/questions")
def get_questions():
    return [{"id": 1, "content": "Sample Question", "tags": ["test"]}]
