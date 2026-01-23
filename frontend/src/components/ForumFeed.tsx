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
    reactions: Record<string, number>;
    user_reaction: string | null;
}

const REACTION_TYPES = [
    { type: 'like', icon: '❤️', label: 'いいね' },
    { type: 'insightful', icon: '💡', label: 'なるほど' },
    { type: 'curious', icon: '🤔', label: '気になる' },
    { type: 'funny', icon: '😂', label: 'うける' },
];

export default function ForumFeed({ role, user }: Props) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [inputContent, setInputContent] = useState('');
    const [inputTags, setInputTags] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeReactionMenu, setActiveReactionMenu] = useState<number | null>(null);

    const fetchQuestions = async () => {
        try {
            // Pass username if logged in to get 'user_reaction' status
            const query = user?.username ? `?username=${encodeURIComponent(user.username)}` : '';
            const res = await fetch(`/api/questions${query}`);
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
    }, [user]); // Re-fetch if user changes

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

    const handleReaction = async (questionId: number, reactionType: string) => {
        if (!user) {
            alert("リアクションするにはログインしてね！");
            return;
        }

        // Optimistic update
        setQuestions(prev => prev.map(q => {
            if (q.id !== questionId) return q;

            const isRemoving = q.user_reaction === reactionType;
            const newReaction = isRemoving ? null : reactionType;
            const newCounts = { ...q.reactions };

            // Remove old reaction if exists
            if (q.user_reaction) {
                newCounts[q.user_reaction] = Math.max(0, (newCounts[q.user_reaction] || 0) - 1);
            }
            // Add new reaction if not removing
            if (!isRemoving) {
                newCounts[reactionType] = (newCounts[reactionType] || 0) + 1;
            }

            return { ...q, user_reaction: newReaction, reactions: newCounts };
        }));

        try {
            await fetch(`/api/questions/${questionId}/react`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: user.username,
                    reaction_type: reactionType
                })
            });
            // fetchQuestions(); // Eventually consistent via polling, or uncomment to sync immediately
        } catch (err) {
            console.error("Reaction failed", err);
            fetchQuestions(); // Revert on error
        }
    };

    const toggleReactionMenu = (qId: number) => {
        if (activeReactionMenu === qId) {
            setActiveReactionMenu(null);
        } else {
            setActiveReactionMenu(qId);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">みんなの広場</h2>
                {role === 'student' && !showForm && (
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-xs text-slate-400">1行からでもOKです！</span>
                        <button
                            className="primary shadow-lg shadow-indigo-500/50"
                            onClick={() => setShowForm(true)}
                        >
                            + 質問する
                        </button>
                    </div>
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
                        placeholder="タグは迷ったら無記入でもOK（例: #JS, #初心者）"
                        value={inputTags}
                        onChange={e => setInputTags(e.target.value)}
                    />
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">投稿後も修正・削除できるので安心してください</span>
                        <div className="flex items-center gap-2">
                            <button className="text-slate-400 text-sm" onClick={() => setShowForm(false)}>キャンセル</button>
                            <button className="primary text-sm" onClick={submitQuestion} disabled={loading}>
                                {loading ? '送信中...' : '質問する'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                {questions.length === 0 && (
                    <div className="text-center text-slate-500 py-10">
                        まだ質問はありません。最初の質問を投稿してみよう！
                    </div>
                )}
                {questions.map(q => {
                    const isMyQuestion = user?.username === q.author;
                    return (
                        <div key={q.id} className={`p-4 rounded-lg bg-slate-800 border transition-colors ${isMyQuestion ? 'border-indigo-500 shadow-md shadow-indigo-500/10' : 'border-slate-700 hover:border-indigo-500'
                            }`}>
                            <div className="flex justify-between text-sm text-slate-400 mb-2">
                                <div className="flex items-center gap-2">
                                    <span>{q.author}</span>
                                    {isMyQuestion && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">あなた</span>}
                                </div>
                                <div className="flex gap-2">
                                    {Array.isArray(q.tags) && q.tags.map((tag, i) => (
                                        <span key={i} className="text-indigo-400">{tag.startsWith('#') ? tag : '#' + tag}</span>
                                    ))}
                                </div>
                            </div>
                            <p className="text-slate-200 mb-4 whitespace-pre-wrap">{q.content}</p>

                            {/* Reaction Bar */}
                            <div className="flex gap-2 flex-wrap border-t border-slate-700 pt-3 items-center">
                                {REACTION_TYPES.map(r => {
                                    const count = q.reactions?.[r.type] || 0;
                                    const isActive = q.user_reaction === r.type;

                                    // Hide if 0 count and not active
                                    if (count === 0 && !isActive) return null;

                                    return (
                                        <button
                                            key={r.type}
                                            onClick={() => handleReaction(q.id, r.type)}
                                            className={`flex items-center justify-center gap-2 px-2 py-1 rounded-full transition-all w-20 ${isActive
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                }`}
                                        >
                                            <span className="text-lg">{r.icon}</span>
                                            <span className={`text-sm ${count > 0 ? 'font-bold' : ''}`}>{count}</span>
                                        </button>
                                    );
                                })}

                                {/* Reaction Picker Button */}
                                <div className="relative">
                                    <button
                                        className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                                        onClick={() => toggleReactionMenu(q.id)}
                                    >
                                        +
                                    </button>

                                    {activeReactionMenu === q.id && (
                                        <div className="absolute left-0 bottom-full mb-2 flex gap-1 p-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-10">
                                            {REACTION_TYPES.map(r => (
                                                <button
                                                    key={r.type}
                                                    className="w-8 h-8 flex items-center justify-center text-xl hover:bg-slate-700 rounded-lg transition-colors"
                                                    onClick={() => {
                                                        handleReaction(q.id, r.type);
                                                        setActiveReactionMenu(null);
                                                    }}
                                                    title={r.label}
                                                >
                                                    {r.icon}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <button className="ml-auto text-sm text-slate-400 hover:text-white">💬 コメントする</button>
                                {role === 'lecturer' && <button className="text-red-400 text-sm hover:text-red-300 ml-2">削除</button>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Overlay to close menu when clicking outside */}
            {activeReactionMenu !== null && (
                <div
                    className="fixed inset-0 z-0 bg-transparent"
                    onClick={() => setActiveReactionMenu(null)}
                />
            )}
        </div>
    );
}
