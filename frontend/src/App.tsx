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
              Everyone (Forum)
            </button>
            {role === 'student' && (
              <button
                className={view === 'chat' ? 'primary' : ''}
                onClick={() => setView('chat')}
              >
                My AI Buddy
              </button>
            )}
            {role === 'lecturer' && (
              <button
                className={view === 'monitoring' ? 'primary' : ''}
                onClick={() => setView('monitoring')}
              >
                AI Insights
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-400">
            Current Role: <span className="font-bold text-white uppercase">{role}</span>
          </div>
          <button
            onClick={() => handleRoleChange(role === 'student' ? 'lecturer' : 'student')}
            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
          >
            Switch to {role === 'student' ? 'Lecturer' : 'Student'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative m-4 mt-0 glass-panel p-4">
        {view === 'forum' && <ForumFeed role={role} />}
        {view === 'chat' && role === 'student' && <AIChatWindow />}
        {view === 'monitoring' && role === 'lecturer' && (
          <div className="h-full flex flex-col justify-center items-center text-slate-400">
            <h2>AI Insights Board</h2>
            <p>Ask AI about student trends here.</p>
            {/* Reuse AIChatWindow or dedicated component later */}
            <div className="mt-4 p-8 border border-dashed border-slate-700 rounded-lg">
              [AI Insight Component Placeholder]
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
