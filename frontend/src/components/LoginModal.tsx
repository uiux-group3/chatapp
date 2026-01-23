import { useState } from 'react';

interface User {
    id: number;
    username: string;
}

interface Props {
    onLogin: (user: User) => void;
}

export default function LoginModal({ onLogin }: Props) {
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!username.trim()) return;
        setLoading(true);
        setError('');
        
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim() }),
            });
            
            if (res.ok) {
                const user = await res.json();
                onLogin(user);
            } else {
                setError('ログインに失敗しました');
            }
        } catch (err) {
            console.error(err);
            setError('サーバーエラーが発生しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-2xl max-w-sm w-full mx-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-6 text-center">
                    Q-Chat へようこそ
                </h2>
                
                <div className="mb-6">
                    <label className="block text-slate-400 text-sm mb-2">ニックネーム</label>
                    <input
                        type="text"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="例: たろう"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLogin()}
                        autoFocus
                    />
                    {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                </div>

                <button
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-indigo-500/20"
                    onClick={handleLogin}
                    disabled={loading || !username.trim()}
                >
                    {loading ? '認証中...' : 'はじめる'}
                </button>
                
                <p className="text-slate-500 text-xs text-center mt-4">
                    ※ ニックネームを入力するだけで、次回も同じユーザーとして利用できます。
                </p>
            </div>
        </div>
    );
}
