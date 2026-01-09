import { useState } from 'react';
import './App.css';
import ForumFeed from './components/ForumFeed';
import AIChatWindow from './components/AIChatWindow';

type Role = 'student' | 'lecturer';
type View = 'forum' | 'chat' | 'monitoring';

function App() {
  const [role, setRole] = useState<Role>('student');
  const [view, setView] = useState<View>('forum');

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    // Reset view based on role default
    setView(newRole === 'student' ? 'forum' : 'monitoring');
  };

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
            現在のモード: <span className="font-bold text-white uppercase">{role === 'student' ? '学生' : '講師'}</span>
          </div>
          <button
            onClick={() => handleRoleChange(role === 'student' ? 'lecturer' : 'student')}
            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
          >
            {role === 'student' ? '講師モードへ切替' : '学生モードへ切替'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative m-4 mt-0 glass-panel p-4">
        {view === 'forum' && <ForumFeed role={role} />}
        {view === 'chat' && role === 'student' && <AIChatWindow />}
        {view === 'monitoring' && role === 'lecturer' && (
          <LecturerInsightBoard />
        )}
      </main>
    </div>
  );
}

function LecturerInsightBoard() {
  const [query, setQuery] = useState('');
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);

  const askInsight = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/lecturer/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setReport(data.response);
    } catch (err) {
      console.error(err);
      setReport('エラー: インサイトを取得できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          className="flex-1"
          placeholder="AIに質問: 例「今日、学生がつまずいている点はどこ？」"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && askInsight()}
        />
        <button className="primary" onClick={askInsight} disabled={loading}>
          {loading ? '分析中...' : '分析する'}
        </button>
      </div>

      <div className="flex-1 bg-slate-800 rounded-lg p-6 border border-slate-700 overflow-y-auto">
        {report ? (
          <div className="whitespace-pre-wrap leading-relaxed">
            <h3 className="text-indigo-400 font-bold mb-4">AIインサイト レポート</h3>
            {report}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <p>まだ生成されたレポートはありません。</p>
            <p className="text-sm">学生のチャットログを分析するには質問を入力してください。</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
