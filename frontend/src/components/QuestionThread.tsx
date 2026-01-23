import { useEffect, useMemo, useState } from 'react';

interface User {
  id: number;
  username: string;
}

interface Question {
  id: number;
  author: string;
  content: string;
  tags: string[];
  comment_count: number;
  reactions: Record<string, number>;
  user_reaction: string | null;
}

interface Comment {
  id: number;
  question_id: number;
  author: string;
  content: string;
  created_at: string;
  reactions: Record<string, number>;
  user_reaction: string | null;
}

interface Props {
  questionId: number;
  user?: User | null;
  onBack: () => void;
}

export default function QuestionThread({ questionId, user, onBack }: Props) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [input, setInput] = useState('');
  const [activeReactionMenu, setActiveReactionMenu] = useState<number | null>(null);
  const [questionReactionMenuOpen, setQuestionReactionMenuOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [editQuestionContent, setEditQuestionContent] = useState('');
  const [editQuestionTags, setEditQuestionTags] = useState('');
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  const usernameQuery = useMemo(() => {
    return user?.username ? `?username=${encodeURIComponent(user.username)}` : '';
  }, [user?.username]);

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [qRes, cRes] = await Promise.all([
        fetch(`/api/questions/${questionId}${usernameQuery}`),
        fetch(`/api/questions/${questionId}/comments${usernameQuery}`),
      ]);
      if (qRes.ok) setQuestion(await qRes.json());
      if (cRes.ok) setComments(await cRes.json());
    } catch (err) {
      console.error('Failed to load thread', err);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load({ silent: true }), 8000);
    return () => clearInterval(interval);
  }, [questionId, usernameQuery]);

  const postComment = async () => {
    if (!user) {
      alert('コメントするにはログインしてね！');
      return;
    }
    if (!input.trim() || posting) return;

    setPosting(true);
    try {
      const res = await fetch(`/api/questions/${questionId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: user.username, content: input }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setInput('');
      await load();
    } catch (err) {
      console.error(err);
      alert('コメント投稿に失敗しました');
    } finally {
      setPosting(false);
    }
  };

  const startEditQuestion = () => {
    if (!question) return;
    setEditingQuestion(true);
    setEditQuestionContent(question.content);
    setEditQuestionTags(Array.isArray(question.tags) ? question.tags.join(', ') : '');
    setQuestionReactionMenuOpen(false);
  };

  const cancelEditQuestion = () => {
    setEditingQuestion(false);
    setEditQuestionContent('');
    setEditQuestionTags('');
    setSavingQuestion(false);
  };

  const saveEditQuestion = async () => {
    if (!user) return;
    if (!question) return;
    if (!editQuestionContent.trim() || savingQuestion) return;

    setSavingQuestion(true);
    try {
      const tags = editQuestionTags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch(`/api/questions/${questionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          content: editQuestionContent,
          tags: tags,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setQuestion(data);
      cancelEditQuestion();
    } catch (err) {
      console.error(err);
      alert('編集に失敗しました');
    } finally {
      setSavingQuestion(false);
    }
  };

  const startEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditCommentContent(comment.content);
    setActiveReactionMenu(null);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentContent('');
    setSavingComment(false);
  };

  const saveEditComment = async (commentId: number) => {
    if (!user) return;
    if (!editCommentContent.trim() || savingComment) return;

    setSavingComment(true);
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          content: editCommentContent,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setComments(prev => prev.map(c => (c.id === commentId ? data : c)));
      cancelEditComment();
    } catch (err) {
      console.error(err);
      alert('編集に失敗しました');
    } finally {
      setSavingComment(false);
    }
  };

  const deleteComment = async (commentId: number) => {
    if (!user) return;
    if (!confirm('このコメントを削除しますか？')) return;

    setComments(prev => prev.filter(c => c.id !== commentId));
    try {
      const res = await fetch(`/api/comments/${commentId}?username=${encodeURIComponent(user.username)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      await load();
    } catch (err) {
      console.error(err);
      alert('削除に失敗しました');
      await load();
    }
  };

  const REACTION_TYPES = [
    { type: 'like', icon: '❤️', label: 'いいね' },
    { type: 'insightful', icon: '💡', label: 'なるほど' },
    { type: 'curious', icon: '🤔', label: '気になる' },
    { type: 'funny', icon: '😂', label: 'うける' },
  ];

  const handleQuestionReaction = async (reactionType: string) => {
    if (!user) {
      alert('リアクションするにはログインしてね！');
      return;
    }
    if (!question) return;

    setQuestion(prev => {
      if (!prev) return prev;
      const isRemoving = prev.user_reaction === reactionType;
      const newReaction = isRemoving ? null : reactionType;
      const newCounts = { ...(prev.reactions || {}) };

      if (prev.user_reaction) {
        newCounts[prev.user_reaction] = Math.max(0, (newCounts[prev.user_reaction] || 0) - 1);
      }
      if (!isRemoving) {
        newCounts[reactionType] = (newCounts[reactionType] || 0) + 1;
      }

      return { ...prev, user_reaction: newReaction, reactions: newCounts };
    });

    try {
      await fetch(`/api/questions/${questionId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          reaction_type: reactionType,
        }),
      });
    } catch (err) {
      console.error('Question reaction failed', err);
      await load();
    }
  };

  const toggleReactionMenu = (commentId: number) => {
    setActiveReactionMenu(prev => (prev === commentId ? null : commentId));
  };

  const handleCommentReaction = async (commentId: number, reactionType: string) => {
    if (!user) {
      alert('リアクションするにはログインしてね！');
      return;
    }

    setComments(prev =>
      prev.map(c => {
        if (c.id !== commentId) return c;

        const isRemoving = c.user_reaction === reactionType;
        const newReaction = isRemoving ? null : reactionType;
        const newCounts = { ...(c.reactions || {}) };

        if (c.user_reaction) {
          newCounts[c.user_reaction] = Math.max(0, (newCounts[c.user_reaction] || 0) - 1);
        }
        if (!isRemoving) {
          newCounts[reactionType] = (newCounts[reactionType] || 0) + 1;
        }

        return { ...c, user_reaction: newReaction, reactions: newCounts };
      }),
    );

    try {
      await fetch(`/api/comments/${commentId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          reaction_type: reactionType,
        }),
      });
    } catch (err) {
      console.error('Comment reaction failed', err);
      await load();
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <button onClick={onBack}>← 戻る</button>
        <div className="font-bold">スレッド</div>
        <div className="w-16" />
      </div>

      {question && (
        <div className="p-4 rounded-lg bg-slate-800 border border-slate-700">
          <div className="flex justify-between items-center text-sm text-slate-400 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-500">👤</div>
              <span className="font-medium">{question.author}</span>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {Array.isArray(question.tags) &&
                question.tags.map((tag, i) => (
                  <span key={i} className="text-indigo-400">
                    {tag.startsWith('#') ? tag : '#' + tag}
                  </span>
                ))}
            </div>
          </div>
          {editingQuestion ? (
            <div>
              <textarea
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-white"
                rows={4}
                value={editQuestionContent}
                onChange={e => setEditQuestionContent(e.target.value)}
              />
              <input
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-white text-sm"
                value={editQuestionTags}
                onChange={e => setEditQuestionTags(e.target.value)}
                placeholder="タグ（例: #JS, #初心者）"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Enterでは送信されません</span>
                <div className="flex items-center gap-2">
                  <button className="text-slate-400 text-sm" onClick={cancelEditQuestion} disabled={savingQuestion}>
                    キャンセル
                  </button>
                  <button className="primary text-sm" onClick={saveEditQuestion} disabled={savingQuestion}>
                    {savingQuestion ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-slate-200 whitespace-pre-wrap">{question.content}</p>
              {user?.username === question.author && (
                <button className="text-slate-400 text-xs hover:text-white mt-2" onClick={startEditQuestion}>
                  編集
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap border-t border-slate-700 pt-3 items-center mt-3">
            {REACTION_TYPES.map(r => {
              const count = question.reactions?.[r.type] || 0;
              const isActive = question.user_reaction === r.type;
              if (count === 0 && !isActive) return null;

              return (
                <button
                  key={r.type}
                  onClick={() => handleQuestionReaction(r.type)}
                  className={`flex items-center justify-center gap-2 px-2 py-1 rounded-full transition-all w-16 ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                >
                  <span className="text-sm">{r.icon}</span>
                  <span className={`text-xs ${count > 0 ? 'font-bold' : ''}`}>{count}</span>
                </button>
              );
            })}

                <div className="relative">
                  <button
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                    onClick={() => setQuestionReactionMenuOpen(v => !v)}
                    disabled={editingQuestion}
                  >
                    +
                  </button>

              {questionReactionMenuOpen && (
                <div className="absolute left-0 bottom-full mb-2 flex gap-1 p-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-10">
                  {REACTION_TYPES.map(r => (
                    <button
                      key={r.type}
                      className="w-8 h-8 flex items-center justify-center text-xl hover:bg-slate-700 rounded-lg transition-colors"
                      onClick={() => {
                        handleQuestionReaction(r.type);
                        setQuestionReactionMenuOpen(false);
                      }}
                      title={r.label}
                    >
                      {r.icon}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-auto text-xs text-slate-500">コメント {question.comment_count}</div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {loading && <div className="text-slate-500 text-sm">読み込み中...</div>}
        {!loading && comments.length === 0 && (
          <div className="text-slate-500 text-sm">まだコメントはありません。最初のコメントをどうぞ！</div>
        )}
        {comments.map(c => {
          const isMine = user?.username === c.author;
          const isEditing = editingCommentId === c.id;
          return (
            <div key={c.id} className="p-3 rounded-lg bg-slate-800 border border-slate-700">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="font-bold">{c.author}</span>
                  <span className="text-xs text-slate-500">{formatTime(c.created_at)}</span>
                </div>
                {isMine && (
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <button className="text-slate-400 text-xs hover:text-white" onClick={() => startEditComment(c)}>
                        編集
                      </button>
                    )}
                    <button className="text-red-400 text-xs hover:text-red-300" onClick={() => deleteComment(c.id)} disabled={isEditing}>
                      削除
                    </button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div>
                  <textarea
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 mb-2 text-white"
                    rows={3}
                    value={editCommentContent}
                    onChange={e => setEditCommentContent(e.target.value)}
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Enterでは送信されません</span>
                    <div className="flex items-center gap-2">
                      <button className="text-slate-400 text-sm" onClick={cancelEditComment} disabled={savingComment}>
                        キャンセル
                      </button>
                      <button className="primary text-sm" onClick={() => saveEditComment(c.id)} disabled={savingComment}>
                        {savingComment ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-200 whitespace-pre-wrap text-sm">{c.content}</div>
              )}

              <div className="flex gap-2 flex-wrap border-t border-slate-700 pt-3 items-center mt-2">
                {REACTION_TYPES.map(r => {
                  const count = c.reactions?.[r.type] || 0;
                  const isActive = c.user_reaction === r.type;
                  if (count === 0 && !isActive) return null;

                  return (
                    <button
                      key={r.type}
                      onClick={() => handleCommentReaction(c.id, r.type)}
                      disabled={isEditing}
                      className={`flex items-center justify-center gap-2 px-2 py-1 rounded-full transition-all w-16 ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                    >
                      <span className="text-sm">{r.icon}</span>
                      <span className={`text-xs ${count > 0 ? 'font-bold' : ''}`}>{count}</span>
                    </button>
                  );
                })}

                <div className="relative">
                  <button
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                    onClick={() => toggleReactionMenu(c.id)}
                    disabled={isEditing}
                  >
                    +
                  </button>

                  {activeReactionMenu === c.id && (
                    <div className="absolute left-0 bottom-full mb-2 flex gap-1 p-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-10">
                      {REACTION_TYPES.map(r => (
                        <button
                          key={r.type}
                          className="w-8 h-8 flex items-center justify-center text-xl hover:bg-slate-700 rounded-lg transition-colors"
                          onClick={() => {
                            handleCommentReaction(c.id, r.type);
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
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 w-full">
        <textarea
          className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white resize-none focus:border-indigo-500 transition-colors"
          placeholder={user ? 'コメントを書く…' : 'コメントするにはログインが必要です'}
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={!user}
        />
        <button className="primary self-end h-12 w-24 shrink-0 flex items-center justify-center font-bold" onClick={postComment} disabled={!user || posting}>
          {posting ? '...' : '送信'}
        </button>
      </div>

      {(activeReactionMenu !== null || questionReactionMenuOpen) && (
        <div
          className="fixed inset-0 z-0 bg-transparent"
          onClick={() => {
            setActiveReactionMenu(null);
            setQuestionReactionMenuOpen(false);
          }}
        />
      )}
    </div>
  );
}
