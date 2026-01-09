from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Question(BaseModel):
    content: str
    tags: list[str] = []

@app.get("/")
def read_root():
    return {"Hello": "World", "Service": "Question Chat App"}

@app.get("/questions")
def get_questions():
    return [{"id": 1, "content": "Sample Question", "tags": ["test"]}]
