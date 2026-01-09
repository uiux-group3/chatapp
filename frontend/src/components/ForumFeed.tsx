import { useState } from 'react';

interface Props {
    role: 'student' | 'lecturer';
}

export default function ForumFeed({ role }: Props) {
    // Mock data
    const [questions] = useState([
        { id: 1, author: '学生#123', content: 'let と var の違いは何ですか？', tags: ['#js', '#至急'], likes: 5 },
        { id: 2, author: '学生#456', content: '依存関係のインストールがうまくいきません。', tags: ['#env'], likes: 2 },
    ]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">みんなの広場</h2>
                {role === 'student' && (
                    <button className="primary shadow-lg shadow-indigo-500/50">
                        + 質問する
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {questions.map(q => (
                    <div key={q.id} className="p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-colors">
                        <div className="flex justify-between text-sm text-slate-400 mb-2">
                            <span>{q.author}</span>
                            <div className="flex gap-2">
                                {q.tags.map(tag => (
                                    <span key={tag} className="text-indigo-400">{tag}</span>
                                ))}
                            </div>
                        </div>
                        <p className="text-slate-200 mb-4">{q.content}</p>
                        <div className="flex gap-4 text-sm">
                            <button className="text-slate-400 hover:text-white">❤️ {q.likes}</button>
                            <button className="text-slate-400 hover:text-white">💬 コメント</button>
                            {role === 'lecturer' && <button className="text-red-400 hover:text-red-300">削除</button>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
