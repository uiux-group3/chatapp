import { useState } from 'react';

interface Props {
    role: 'student' | 'lecturer';
}

export default function ForumFeed({ role }: Props) {
    // Mock data
    const [questions] = useState([
        { id: 1, author: 'Student#123', content: 'What is the difference between let and var?', tags: ['#js', '#urgent'], likes: 5 },
        { id: 2, author: 'Student#456', content: 'I cannot install the dependencies.', tags: ['#env'], likes: 2 },
    ]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">Class Forum</h2>
                {role === 'student' && (
                    <button className="primary shadow-lg shadow-indigo-500/50">
                        + New Question
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
                            <button className="text-slate-400 hover:text-white">💬 Comment</button>
                            {role === 'lecturer' && <button className="text-red-400 hover:text-red-300">Delete</button>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
