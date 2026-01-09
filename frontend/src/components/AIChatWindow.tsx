export default function AIChatWindow() {
    return (
        <div className="h-full flex flex-col">
            <div className="mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <h2 className="font-bold text-lg">Private AI Tutor</h2>
            </div>

            <div className="flex-1 bg-slate-800/50 rounded-lg p-4 mb-4 border border-slate-700 flex flex-col items-center justify-center text-slate-500">
                <p>AI Chat History will appear here.</p>
                <p className="text-sm mt-2">Only you can see this conversation.</p>
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Ask AI anything..."
                    className="flex-1"
                />
                <button className="primary">Send</button>
            </div>
        </div>
    );
}
