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
        <div className="login-modal-overlay absolute inset-0 flex items-center justify-center">
            <div className="login-modal-card">
                <h2 className="login-modal-title">Q-Chat へようこそ</h2>

                <div className="login-modal-field">
                    <label className="login-modal-label">ニックネーム</label>
                    <input
                        type="text"
                        className="login-modal-input"
                        placeholder="例: たろう"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLogin()}
                        autoFocus
                    />
                    {error && <p className="login-modal-error">{error}</p>}
                </div>

                <button
                    className="login-modal-button"
                    onClick={handleLogin}
                    disabled={loading || !username.trim()}
                >
                    {loading ? '認証中...' : 'はじめる'}
                </button>
                
                <p className="login-modal-hint">
                    ※ (テストモード)ニックネームを入力するだけで、次回も同じユーザーとして利用できます。
                </p>
            </div>
        </div>
    );
}
