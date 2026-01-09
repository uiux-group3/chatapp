# Question Chat App Prototype

## Overview
A web application to facilitate questioning in lectures, focusing on reducing psychological barriers. Features "Heavy" public questions and "Light" private AI chat.

## Structure
- `/frontend`: React + Vite + TypeScript
- `/backend`: Python + FastAPI + SQLite

## Setup

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
fastapi dev main.py
```
