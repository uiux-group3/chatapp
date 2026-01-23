
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

    # 5. Test Reactions (New)
    print("[TEST] Testing Reactions...")
    
    # 5a. Create a question
    q_content = "Reaction Test Question"
    print(f"[TEST] Creating question: '{q_content}'")
    status, q_body = make_request("/questions", "POST", {"author": username, "content": q_content, "tags": ["test"]})
    if status != 200:
        print(f"[FAIL] Create Question failed: {status}")
        return False
    q_id = q_body["id"]
    print(f"[PASS] Question created. ID: {q_id}")
    
    # 5b. Add Reaction
    print("[TEST] Adding 'like' reaction...")
    status, r_body = make_request(f"/questions/{q_id}/react", "POST", {"username": username, "reaction_type": "like"})
    if status != 200 or r_body.get("status") != "added":
        print(f"[FAIL] Add reaction failed: {status} {r_body}")
        return False
    print("[PASS] Reaction added.")
    
    # 5c. Verify Reaction Count via GET
    print("[TEST] Verifying reaction count...")
    status, questions = make_request(f"/questions?username={username}", "GET")
    if status != 200:
         print(f"[FAIL] Get Questions failed: {status}")
         return False
    
    q_found = False
    for q in questions:
        if q["id"] == q_id:
            q_found = True
            reactions = q.get("reactions", {})
            user_reaction = q.get("user_reaction")
            if reactions.get("like") == 1 and user_reaction == "like":
                print("[PASS] Reaction count and user status correct.")
            else:
                 print(f"[FAIL] Reaction data mismatch: {q}")
                 return False
            break
    
    if not q_found:
        print("[FAIL] Created question not found in list.")
        return False

    # 5d. Toggle Off Reaction
    print("[TEST] Toggling off reaction...")
    status, r_body = make_request(f"/questions/{q_id}/react", "POST", {"username": username, "reaction_type": "like"})
    if status != 200 or r_body.get("status") != "removed":
        print(f"[FAIL] Remove reaction failed: {status} {r_body}")
        return False
    print("[PASS] Reaction removed.")

    print("=== VERIFICATION SUCCESSFUL ===")
    return True

if __name__ == "__main__":
    if test_flow():
        sys.exit(0)
    else:
        sys.exit(1)
