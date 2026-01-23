import { useState, useEffect } from 'react';

interface User {
    id: number;
    username: string;
}

interface Props {
    role: 'student' | 'lecturer';
    user?: User | null;
}

interface Question {
    id: number;
    author: string;
    content: string;
    tags: string[];
    likes: number;
}

export default function ForumFeed({ role, user }: Props) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [inputContent, setInputContent] = useState('');
    const [inputTags, setInputTags] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchQuestions = async () => {
        try {
            const res = await fetch('/api/questions');
            if (res.ok) {
                const data = await res.json();
                setQuestions(data);
            }
        } catch (err) {
            console.error("Failed to fetch questions", err);
        }
    };

    useEffect(() => {
        fetchQuestions();
        const interval = setInterval(fetchQuestions, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    const submitQuestion = async () => {
        if (!inputContent.trim() || loading) return;
        setLoading(true);
        try {
            const tags = inputTags.split(',').map(t => t.trim()).filter(Boolean);
            const res = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    author: user?.username || 'Anonymous', 
                    content: inputContent,
                    tags: tags
                })
            });
            if (res.ok) {
                setInputContent('');
                setInputTags('');
                setShowForm(false);
                fetchQuestions();
            }
        } catch (err) {
            console.error(err);
            alert("投稿に失敗しました");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">みんなの広場</h2>
                {role === 'student' && !showForm && (
                    <button 
                        className="primary shadow-lg shadow-indigo-500/50"
                        onClick={() => setShowForm(true)}
                    >
                        + 質問する
                    </button>
                )}
            </div>

            {showForm && (
                <div className="bg-slate-800 p-4 rounded-lg mb-4 border border-indigo-500/50">
                    <textarea
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-white"
                        placeholder="質問内容を入力してね（例: 変数宣言の違いがわかりません）"
                        rows={3}
                        value={inputContent}
                        onChange={e => setInputContent(e.target.value)}
                    />
                    <input
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-white text-sm"
                        placeholder="タグ (カンマ区切り): #JS, #初心者"
                        value={inputTags}
                        onChange={e => setInputTags(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                        <button className="text-slate-400 text-sm" onClick={() => setShowForm(false)}>キャンセル</button>
                        <button className="primary text-sm" onClick={submitQuestion} disabled={loading}>
                            {loading ? '送信中...' : '投稿する'}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {questions.length === 0 && (
                    <div className="text-center text-slate-500 py-10">
                        まだ質問はありません。最初の質問を投稿してみよう！
                    </div>
                )}
                {questions.map(q => (
                    <div key={q.id} className="p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-colors">
                        <div className="flex justify-between text-sm text-slate-400 mb-2">
                            <span>{q.author}</span>
                            <div className="flex gap-2">
                                {Array.isArray(q.tags) && q.tags.map((tag, i) => (
                                    <span key={i} className="text-indigo-400">{tag.startsWith('#') ? tag : '#' + tag}</span>
                                ))}
                            </div>
                        </div>
                        <p className="text-slate-200 mb-4 whitespace-pre-wrap">{q.content}</p>
                        <div className="flex gap-4 text-sm">
                            <button className="text-slate-400 hover:text-white">❤️ {q.likes || 0}</button>
                            <button className="text-slate-400 hover:text-white">💬 コメント</button>
                            {role === 'lecturer' && <button className="text-red-400 hover:text-red-300">削除</button>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
