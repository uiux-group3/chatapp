import { useState, useEffect } from 'react';
import './App.css';
import ForumFeed from './components/ForumFeed';
import AIChatWindow from './components/AIChatWindow';
import LoginModal from './components/LoginModal';

type Role = 'student' | 'lecturer';
type View = 'forum' | 'chat' | 'monitoring';

interface User {
  id: number;
  username: string;
}

function App() {
  const [role, setRole] = useState<Role>('student');
  const [view, setView] = useState<View>('forum');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('chat_app_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    localStorage.setItem('chat_app_user', JSON.stringify(loggedInUser));
  };

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    // Reset view based on role default
    setView(newRole === 'student' ? 'forum' : 'monitoring');
  };

  if (!user) {
    return <LoginModal onLogin={handleLogin} />;
  }

  return (
    <div className="flex-col h-full bg-slate-900 text-white">
      {/* Header */}
      <header className="glass-panel m-4 p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Q-Chat
          </h1>
          <div className="flex gap-2 text-sm bg-slate-800 p-1 rounded-lg">
            <button
              className={view === 'forum' ? 'primary' : ''}
              onClick={() => setView('forum')}
            >
              みんなの広場 (掲示板)
            </button>
            {role === 'student' && (
              <button
                className={view === 'chat' ? 'primary' : ''}
                onClick={() => setView('chat')}
              >
                マイAIバディ (相談)
              </button>
            )}
            {role === 'lecturer' && (
              <button
                className={view === 'monitoring' ? 'primary' : ''}
                onClick={() => setView('monitoring')}
              >
                AIインサイト
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-400">
            {user.username} さん | 現在のモード: <span className="font-bold text-white uppercase">{role === 'student' ? '学生' : '講師'}</span>
          </div>
          <button
            onClick={() => handleRoleChange(role === 'student' ? 'lecturer' : 'student')}
            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
          >
            {role === 'student' ? '講師モードへ切替' : '学生モードへ切替'}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('chat_app_user');
              setUser(null);
            }}
            style={{ fontSize: '0.8rem', padding: '4px 8px', background: '#475569' }}
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative m-4 mt-0 glass-panel p-4">
        {view === 'forum' && <ForumFeed role={role} user={user} />}
        {view === 'chat' && role === 'student' && <AIChatWindow user={user} />}
        {view === 'monitoring' && role === 'lecturer' && (
          <LecturerInsightBoard user={user} />
        )}
      </main>
    </div>
  );
}

function LecturerInsightBoard({ user }: { user: User }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Persistent session ID for lecturer based on user ID
  const sessionId = `lecturer-${user.id}`;

  useEffect(() => {
    // Fetch history on mount
    fetch(`/api/chat/history?session_id=${sessionId}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          setMessages(data.map((msg: any) => ({
            role: msg.role === 'model' ? 'model' : 'user',
            content: msg.content
          })));
        }
      })
      .catch(err => console.error("Failed to load history", err));
  }, [sessionId]);

  const askInsight = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/lecturer/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg, session_id: sessionId }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }
      setMessages(prev => [...prev, { role: 'model', content: data.response ?? '' }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', content: 'エラー: インサイトを取得できませんでした。' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-indigo-400 font-bold">AIインサイト（クラス分析）</h2>
        <span className="text-xs text-slate-500">チャット形式で深掘り分析ができます</span>
      </div>

      <div className="flex-1 bg-slate-800 rounded-lg p-4 border border-slate-700 overflow-y-auto flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <p>学生のチャットログと掲示板を分析します。</p>
            <p className="text-sm">質問例: 「最近の学生の悩みは？」「掲示板で話題のトピックは？」</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`p-4 rounded-lg max-w-[90%] ${m.role === 'user' ? 'bg-indigo-900/50 self-end ml-auto border border-indigo-500/30' : 'bg-slate-700/50 self-start border border-slate-600'}`}>
            <div className="text-xs text-slate-400 mb-1 font-bold">{m.role === 'model' ? 'Insight AI' : 'Lecturer'}</div>
            <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
          </div>
        ))}
        {loading && <div className="text-slate-500 text-sm animate-pulse ml-2">分析中...</div>}
      </div>

      <div className="flex gap-2">
        <textarea
          className="flex-1 bg-slate-900 border border-slate-700 rounded p-3 text-white resize-none focus:border-indigo-500 transition-colors"
          placeholder="AIに質問: 例「今日、学生がつまずいている点はどこ？」"
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              askInsight();
            }
          }}
        />
        <button className="primary self-end h-12 w-24 flex items-center justify-center" onClick={askInsight} disabled={loading}>
          {loading ? '...' : '送信'}
        </button>
      </div>
    </div>
  );
}

export default App;
