import { useState, useEffect } from 'react';

interface User {
    id: number;
    username: string;
}

interface Props {
    user?: User | null;
}

export default function AIChatWindow({ user }: Props) {
    const [messages, setMessages] = useState<{ role: 'user' | 'model', content: string }[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    // Persistent session ID based on user ID, or random if not logged in (though App.tsx enforces login now)
    const sessionId = user ? `student-${user.id}` : 'guest-' + Math.random().toString(36).substr(2, 9);

    useEffect(() => {
        if (!user) return;
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

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, message: userMsg }),
            });
            const data = await res.json().catch(() => ({} as any));
            if (!res.ok) {
                throw new Error(data?.detail || `HTTP ${res.status}`);
            }
            setMessages(prev => [...prev, { role: 'model', content: data.response ?? '' }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'model', content: 'エラー: AIに接続できませんでした。' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <h2 className="font-bold text-lg">マイAIバディ (プライベート)</h2>
            </div>

            <div className="flex-1 bg-slate-800/50 rounded-lg p-4 mb-4 border border-slate-700 overflow-y-auto flex flex-col gap-3">
                {messages.length === 0 && (
                    <div className="text-center text-slate-500 mt-10">
                        <p>講義についてなんでも聞いてみよう。</p>
                        <p className="text-xs">このチャットは他の学生には見えません。</p>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`p-3 rounded-lg max-w-[80%] ${m.role === 'user' ? 'bg-indigo-600 self-end ml-auto' : 'bg-slate-700 self-start'}`}>
                        <div className="text-xs text-slate-400 mb-1 uppercase">{m.role === 'model' ? 'AI Tutor' : 'あなた'}</div>
                        <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                ))}
                {loading && <div className="text-slate-500 text-sm animate-pulse">AIが入力中...</div>}
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="AIになんでも聞いてね..."
                    className="flex-1"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                />
                <button className="primary" onClick={sendMessage} disabled={loading}>送信</button>
            </div>
        </div>
    );
}
