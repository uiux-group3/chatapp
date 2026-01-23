
import urllib.request
import urllib.parse
import json
import sqlite3
import sys
import os

BASE_URL = "http://localhost:8000"
DB_PATH = "sql_app.db"

def make_request(endpoint, method="GET", data=None):
    url = f"{BASE_URL}{endpoint}"
    if data:
        json_data = json.dumps(data).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        req = urllib.request.Request(url, data=json_data, headers=headers, method=method)
    else:
        req = urllib.request.Request(url, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            status = response.getcode()
            body = response.read().decode("utf-8")
            try:
                json_body = json.loads(body)
            except:
                json_body = body
            return status, json_body
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode("utf-8")
        try:
            json_body = json.loads(body)
        except:
            json_body = body
        return status, json_body
    except Exception as e:
        print(f"Request Error: {e}")
        return None, None

def test_flow():
    print("=== STARTING INTERNAL VERIFICATION ===")
    
    # 1. Login
    username = "InternalTester"
    print(f"[TEST] Login as {username}...")
    status, body = make_request("/login", "POST", {"username": username})
    if status != 200:
        print(f"[FAIL] Login failed: {status} {body}")
        return False
    user_id = body.get("id")
    print(f"[PASS] Login successful. User ID: {user_id}")
    
    session_id = f"student-{user_id}"
    
    # 2. Chat
    msg_content = "Internal Test Message for Persistence"
    print(f"[TEST] Sending chat message: '{msg_content}' to session {session_id}...")
    status, body = make_request("/chat", "POST", {"session_id": session_id, "message": msg_content})
    
    if status == 200:
        print("[PASS] Chat message accepted (200).")
    elif status == 503:
        print("[WARN] Chat backend 503 (Likely no API Key), but user message should be saved.")
    else:
        print(f"[FAIL] Chat request failed unexpectedlly: {status} {body}")
        
    # 3. Check History via API
    print(f"[TEST] Checking History via API for session {session_id}...")
    status, history = make_request(f"/chat/history?session_id={session_id}", "GET")
    if status != 200:
        print(f"[FAIL] Get history failed: {status}")
        return False
        
    found = False
    for item in history:
        if item.get("content") == msg_content:
            found = True
            break
            
    if found:
        print("[PASS] Message found in history API.")
    else:
        print("[FAIL] Message NOT found in history API.")
        return False

    # 4. Check DB Directly
    print("[TEST] Checking SQLite DB file directly...")
    if not os.path.exists(DB_PATH):
        print(f"[FAIL] DB File {DB_PATH} not found!")
        return False
        
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT content FROM chat_messages WHERE session_id=?", (session_id,))
        rows = c.fetchall()
        db_found = False
        for row in rows:
            if row[0] == msg_content:
                db_found = True
        conn.close()
        
        if db_found:
            print("[PASS] Message found in SQLite DB.")
        else:
            print("[FAIL] Message NOT found in SQLite DB.")
            return False
            
    except Exception as e:
        print(f"[FAIL] DB Error: {e}")
        return False

    print("=== VERIFICATION SUCCESSFUL ===")
    return True

if __name__ == "__main__":
    if test_flow():
        sys.exit(0)
    else:
        sys.exit(1)
