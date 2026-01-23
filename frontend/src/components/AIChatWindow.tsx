import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface User {
    id: number;
    username: string;
}

interface Props {
    user?: User | null;
}

export default function AIChatWindow({ user }: Props) {
    const [messages, setMessages] = useState<{ role: 'user' | 'model', content: string, timestamp?: string }[]>([]);
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
        // 1. Add space before ** if preceded by non-whitespace
        let formatted = content.replace(/([^\s])(\*\*.*?\*\*)/g, '$1 $2');
        // 2. Add space after ** if followed by non-whitespace
        formatted = formatted.replace(/(\*\*.*?\*\*)([^\s])/g, '$1 $2');
        return formatted;
    };

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date().toISOString() }]);
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
            setMessages(prev => [...prev, { role: 'model', content: data.response ?? '', timestamp: new Date().toISOString() }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'model', content: 'エラー: AIに接続できませんでした。', timestamp: new Date().toISOString() }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <h2 className="font-bold text-lg">AIメンター</h2>
            </div>

            <div className="flex-1 bg-slate-800/50 rounded-lg p-4 mb-4 border border-slate-700 overflow-y-auto flex flex-col gap-8">
                {messages.length === 0 && (
                    <div className="text-center text-slate-500 mt-10">
                        <p>講義についてなんでも聞いてみよう。</p>
                        <p className="text-xs">このチャットは他の学生には見えません。</p>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex w-full items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {m.role === 'user' && (
                            <span className="text-xs text-slate-500 shrink-0 mb-1">{formatTime(m.timestamp)}</span>
                        )}
                        <div className={`px-2 py-0 rounded-lg max-w-70p shadow-sm break-words ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-100'}`}>
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
                {loading && <div className="text-slate-500 text-sm animate-pulse">AIが入力中...</div>}
            </div>

            <div className="flex gap-2 w-full items-end">
                <textarea
                    placeholder="まずは状況を1行で。うまく書けなくてもOK"
                    className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    rows={3}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                />
                <button className="primary h-12 w-24 shrink-0 font-bold" onClick={sendMessage} disabled={loading}>送信</button>
            </div>
        </div>
    );
}
