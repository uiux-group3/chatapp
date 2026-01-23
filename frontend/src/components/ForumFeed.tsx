import { useState, useEffect } from 'react';
import QuestionThread from './QuestionThread';

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
    resolved: boolean;
    reactions: Record<string, number>;
    user_reaction: string | null;
    comment_count: number;
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
    const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
    const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editTags, setEditTags] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

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

    const deleteQuestion = async (questionId: number) => {
        if (!user) return;

        const target = questions.find(q => q.id === questionId);
        if (!target) return;

        if (target.author !== user.username) {
            alert("自分の投稿のみ削除できます");
            return;
        }

        if (!confirm("この投稿を削除しますか？")) return;

        setActiveReactionMenu(null);
        setQuestions(prev => prev.filter(q => q.id !== questionId));
        try {
            const res = await fetch(`/api/questions/${questionId}?username=${encodeURIComponent(user.username)}`, {
                method: 'DELETE',
            });
            const data = await res.json().catch(() => ({} as any));
            if (!res.ok) {
                throw new Error(data?.detail || `HTTP ${res.status}`);
            }
        } catch (err) {
            console.error("Delete failed", err);
            alert("削除に失敗しました");
            fetchQuestions();
        }
    };

    const openThread = (questionId: number) => {
        setActiveReactionMenu(null);
        setShowForm(false);
        setSelectedQuestionId(questionId);
    };

    const startEditQuestion = (q: Question) => {
        setActiveReactionMenu(null);
        setEditingQuestionId(q.id);
        setEditContent(q.content);
        setEditTags(Array.isArray(q.tags) ? q.tags.join(', ') : '');
    };

    const cancelEditQuestion = () => {
        setEditingQuestionId(null);
        setEditContent('');
        setEditTags('');
        setSavingEdit(false);
    };

    const saveEditQuestion = async (questionId: number) => {
        if (!user) return;
        if (!editContent.trim() || savingEdit) return;

        setSavingEdit(true);
        try {
            const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
            const res = await fetch(`/api/questions/${questionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: user.username,
                    content: editContent,
                    tags: tags,
                }),
            });
            const data = await res.json().catch(() => ({} as any));
            if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
            setQuestions(prev => prev.map(q => (q.id === questionId ? data : q)));
            cancelEditQuestion();
        } catch (err) {
            console.error(err);
            alert("編集に失敗しました");
        } finally {
            setSavingEdit(false);
        }
    };

    const setResolved = async (questionId: number, resolved: boolean) => {
        if (!user) {
            alert("解決済みにするにはログインしてね！");
            return;
        }

        setQuestions(prev => prev.map(q => (q.id === questionId ? { ...q, resolved } : q)));
        try {
            const res = await fetch(`/api/questions/${questionId}/resolve`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: user.username,
                    resolved,
                }),
            });
            const data = await res.json().catch(() => ({} as any));
            if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
            setQuestions(prev => prev.map(q => (q.id === questionId ? data : q)));
        } catch (err) {
            console.error(err);
            alert("更新に失敗しました");
            fetchQuestions();
        }
    };

    if (selectedQuestionId !== null) {
        return (
            <QuestionThread
                questionId={selectedQuestionId}
                user={user}
                onBack={() => setSelectedQuestionId(null)}
            />
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">みんなの広場</h2>
                {/* Small button removed */}
            </div>

            {showForm && (
                <div className="bg-slate-800 p-4 rounded-lg mb-4 border border-indigo-500/50">
                    <textarea
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-white"
                        placeholder="質問内容を入力してね（例: 「変数宣言の違いがわかりません」、一行でもOK：『〜って何から始めればいい？』"
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
                        <span className="text-xs text-slate-400">投稿後も削除できるので安心してください</span>
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
                {/* Large Ask Question Button Card */}
                {role === 'student' && !showForm && (
                     <button 
                        onClick={() => setShowForm(true)}
                        className="w-full p-6 rounded-lg border-2 border-dashed border-indigo-400/50 bg-slate-800/50 hover:bg-slate-800 hover:border-indigo-400 transition-all group flex flex-col items-center justify-center gap-2 text-slate-900"
                     >
                        <div className="text-3xl bg-indigo-500/20 p-3 rounded-full text-indigo-400 group-hover:scale-110 transition-transform">
                            ✏️
                        </div>
                        <span className="font-bold text-lg">質問を投稿する</span>
                        <span className="text-sm text-slate-500">1行からでもOKです！</span>
                     </button>
                )}

                {questions.length === 0 && (
                    <div className="text-center text-slate-500 py-10">
                        まだ質問はありません。最初の質問を投稿してみよう！
                    </div>
                )}
                {questions.map(q => {
                    const isMyQuestion = user?.username === q.author;
                    const isEditing = editingQuestionId === q.id;
                    return (
                        <div
                            key={q.id}
                            role="button"
                            tabIndex={0}
                            className={`cursor-pointer p-4 rounded-lg bg-slate-800 border transition-colors ${isMyQuestion ? 'border-indigo-500 shadow-md shadow-indigo-500/10' : 'border-slate-700 hover:border-indigo-500'
                            }`}
                            onClick={() => {
                                if (!isEditing) openThread(q.id);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    if (!isEditing) openThread(q.id);
                                }
                            }}
                        >
                            <div className="flex justify-between text-sm text-slate-400 mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-500">
                                        👤
                                    </div>
                                    <span className="font-medium">{q.author}</span>
                                    {isMyQuestion && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">あなた</span>}
                                    <span
                                        className={`text-xs font-bold px-3 py-1 rounded-full ${q.resolved ? 'bg-indigo-600 text-real-white' : 'bg-slate-700 text-slate-900'
                                            }`}
                                    >
                                        {q.resolved ? '✅ 解決済み' : '🟡 未解決'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
	                                    <div className="flex gap-2 flex-wrap justify-end">
	                                        {Array.isArray(q.tags) && q.tags.map((tag, i) => (
	                                            <span key={i} className="text-indigo-400">{tag.startsWith('#') ? tag : '#' + tag}</span>
	                                        ))}
	                                    </div>
	                                    {isMyQuestion && (
	                                        <button
	                                            className={`text-xs ${q.resolved ? 'bg-slate-700 text-slate-900 hover:bg-slate-600' : 'bg-indigo-600 text-real-white hover:bg-emerald-600'
	                                                }`}
	                                            onClick={(e) => {
	                                                e.stopPropagation();
	                                                setResolved(q.id, !q.resolved);
	                                            }}
	                                            title={q.resolved ? "未解決に戻す" : "解決済みにする"}
	                                        >
	                                            {q.resolved ? '未解決に戻す' : '解決済みにする'}
	                                        </button>
	                                    )}
	                                    {isMyQuestion && (
	                                        <button
	                                            className="text-slate-400 text-xs hover:text-white"
	                                            onClick={(e) => {
	                                                e.stopPropagation();
	                                                if (isEditing) {
	                                                    cancelEditQuestion();
	                                                } else {
	                                                    startEditQuestion(q);
	                                                }
	                                            }}
	                                            title={isEditing ? "キャンセル" : "編集"}
	                                        >
	                                            {isEditing ? 'キャンセル' : '編集'}
	                                        </button>
	                                    )}
	                                    {isMyQuestion && (
	                                        <button
	                                            className="text-red-400 text-xs hover:text-red-300"
	                                            onClick={(e) => {
	                                                e.stopPropagation();
	                                                deleteQuestion(q.id);
	                                            }}
	                                            title="削除"
	                                        >
	                                            削除
	                                        </button>
	                                    )}
	                                </div>
	                            </div>

                            {isEditing ? (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <textarea
                                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-white"
                                        rows={4}
                                        value={editContent}
                                        onChange={e => setEditContent(e.target.value)}
                                    />
                                    <input
                                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-white text-sm"
                                        value={editTags}
                                        onChange={e => setEditTags(e.target.value)}
                                        placeholder="タグ（例: #JS, #初心者）"
                                    />
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-slate-400">Enterでは送信されません</span>
                                        <div className="flex items-center gap-2">
                                            <button className="text-slate-400 text-sm" onClick={cancelEditQuestion} disabled={savingEdit}>
                                                キャンセル
                                            </button>
                                            <button className="primary text-sm" onClick={() => saveEditQuestion(q.id)} disabled={savingEdit}>
                                                {savingEdit ? '保存中...' : '保存'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-slate-200 mb-4 whitespace-pre-wrap">{q.content}</p>
                            )}

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
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleReaction(q.id, r.type);
                                            }}
                                            className={`flex items-center justify-center gap-2 px-2 py-1 rounded-full transition-all w-16 ${isActive
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                }`}
                                        >
                                            <span className="text-sm">{r.icon}</span>
                                            <span className={`text-xs ${count > 0 ? 'font-bold' : ''}`}>{count}</span>
                                        </button>
                                    );
                                })}

                                {/* Reaction Picker Button */}
                                <div className="relative">
                                    <button
                                        className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleReactionMenu(q.id);
                                        }}
                                    >
                                        +
                                    </button>

                                    {activeReactionMenu === q.id && (
                                        <div
                                            className="absolute left-0 bottom-full mb-2 flex gap-1 p-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-10"
                                            onClick={(e) => e.stopPropagation()}
                                        >
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

                                <button
                                    className="ml-auto text-sm text-slate-400 hover:text-white"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openThread(q.id);
                                    }}
                                >
                                    💬 コメント {q.comment_count > 0 ? `(${q.comment_count})` : ''}
                                </button>
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
