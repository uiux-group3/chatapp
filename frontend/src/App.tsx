import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
    <div className="flex-col h-full">
      {/* Header */}
      <header className="glass-panel m-4 p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Q-Chat
          </h1>
          <div className="flex gap-2 text-sm">
            {/* Navigation moved to Tabs */}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-500">
              👤
            </div>
            <div>
              {user.username} さん <span className="mx-1">|</span> 現在のモード: <span className="font-bold text-slate-500 uppercase">{role === 'student' ? '学生' : '講師'}</span>
            </div>
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
            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
            className="text-slate-500 hover:text-red-400 border-none bg-transparent shadow-none"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="flex mx-4 mb-0">
        <button
          className={`flex-1 py-3 px-6 rounded-tl-lg rounded-tr-none rounded-b-none font-bold text-sm transition-all border-none ${view === 'forum'
            ? 'bg-indigo-600 text-white shadow-sm z-10 cursor-default pointer-events-none'
            : 'bg-slate-700 text-slate-500 hover:bg-emerald-600 hover:text-white opacity-80'
            }`}
          onClick={() => view !== 'forum' && setView('forum')}
        >
          掲示板で質問する
        </button>
        {role === 'student' && (
          <button
            className={`flex-1 py-3 px-6 rounded-tr-lg rounded-tl-none rounded-b-none font-bold text-sm transition-all border-none ${view === 'chat'
              ? 'bg-indigo-600 text-white shadow-sm z-10 cursor-default pointer-events-none'
              : 'bg-slate-700 text-slate-500 hover:bg-emerald-600 hover:text-white opacity-80'
              }`}
            onClick={() => view !== 'chat' && setView('chat')}
          >
            AIに相談する
          </button>
        )}
        {role === 'lecturer' && (
          <button
            className={`flex-1 py-3 px-6 rounded-tr-lg rounded-tl-none rounded-b-none font-bold text-sm transition-all border-none ${view === 'monitoring'
              ? 'bg-indigo-600 text-white shadow-sm z-10 cursor-default pointer-events-none'
              : 'bg-slate-700 text-slate-500 hover:bg-emerald-600 hover:text-white opacity-80'
              }`}
            onClick={() => view !== 'monitoring' && setView('monitoring')}
          >
            Class AI (分析)
          </button>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative m-4 mt-0 glass-panel p-4 rounded-t-none">
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
  const [messages, setMessages] = useState<{ role: 'user' | 'model', content: string, timestamp?: string }[]>([]);
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
            content: msg.content,
            timestamp: msg.timestamp
          })));
        }
      })
      .catch(err => console.error("Failed to load history", err));
  }, [sessionId]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessage = (content: string) => {
    // Fix inline bold formatting by ensuring spaces around **bold** blocks
    let formatted = content.replace(/([^\s])(\*\*.*?\*\*)/g, '$1 $2');
    formatted = formatted.replace(/(\*\*.*?\*\*)([^\s])/g, '$1 $2');
    return formatted;
  };

  const askInsight = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date().toISOString() }]);
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
      setMessages(prev => [...prev, { role: 'model', content: data.response ?? '', timestamp: new Date().toISOString() }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', content: 'エラー: インサイトを取得できませんでした。', timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-indigo-400 font-bold">Class AI（クラス分析）</h2>
        <span className="text-xs text-slate-500">チャット形式で深掘り分析ができます</span>
      </div>

      <div className="flex-1 bg-slate-800 rounded-lg p-4 border border-slate-700 overflow-y-auto flex flex-col gap-8">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <p>学生のチャットログと掲示板を分析します。</p>
            <p className="text-sm">質問例: 「最近の学生の悩みは？」「掲示板で話題のトピックは？」</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex w-full items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'user' && (
              <span className="text-xs text-slate-500 shrink-0 mb-1">{formatTime(m.timestamp)}</span>
            )}
            <div className={`px-2 py-0 rounded-lg max-w-70p shadow-sm break-words ${m.role === 'user' ? 'bg-indigo-900/50 border border-indigo-500/30' : 'bg-slate-700/50 border border-slate-600'}`}>
              <div className="text-sm leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                  pre: ({ node, ...props }) => <pre className="bg-slate-900/50 p-2 rounded overflow-x-auto my-2" {...props} />,
                  code: ({ node, ...props }) => <code className="bg-slate-900/30 px-1 rounded" {...props} />
                }}>{formatMessage(m.content)}</ReactMarkdown>
              </div>
            </div>
            {m.role === 'model' && (
              <span className="text-xs text-slate-500 shrink-0 mb-1">{formatTime(m.timestamp)}</span>
            )}
          </div>
        ))}
        {loading && <div className="text-slate-500 text-sm animate-pulse ml-2">分析中...</div>}
      </div>

      <div className="flex gap-2 w-full">
        <textarea
          className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white resize-none focus:border-indigo-500 transition-colors"
          placeholder="AIに質問: 例「今日、学生がつまずいている点はどこ？」"
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button className="primary self-end h-12 w-24 shrink-0 flex items-center justify-center font-bold" onClick={askInsight} disabled={loading}>
          {loading ? '...' : '送信'}
        </button>
      </div>
    </div>
  );
}

export default App;
