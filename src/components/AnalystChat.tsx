"use client";

import { useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Which vendor is cheapest overall, counting only lines they actually quoted?",
  "Are there any lines where the cheapest price needs a closer look?",
  "Which vendors offer on-site support?",
];

export function AnalystChat({ linesParam }: { linesParam: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    const nextTurns: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: turns, lines: linesParam }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setTurns((t) => [...t, { role: "assistant", content: data.answer }]);
    } catch (err: any) {
      setTurns((t) => [...t, { role: "assistant", content: `⚠ ${err?.message ?? "Something went wrong."}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-8 pb-10 mt-2">
      <div className="bg-white border border-neutral-200 rounded-lg p-5 max-w-3xl">
        <div className="text-xs font-mono uppercase tracking-wide text-orange-700">Ask the analyst</div>
        <p className="text-sm text-neutral-500 mt-1 mb-3">
          Ask a question about this comparison in plain language — grounded in the actual extracted quotes, not a guess.
        </p>

        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => !loading && send(s)}
                className="text-xs text-left px-3 py-1.5 rounded-full border border-neutral-200 text-neutral-600 hover:border-orange-300 hover:text-orange-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {turns.length > 0 && (
          <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3.5 py-2 text-sm whitespace-pre-wrap ${
                    t.role === "user" ? "bg-orange-600 text-white" : "bg-neutral-50 border border-neutral-200 text-neutral-800"
                  }`}
                >
                  {t.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-3.5 py-2 text-sm text-neutral-400 animate-pulse">
                  analyzing…
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="flex-1 border border-neutral-300 rounded-md px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim() && !loading) send(input.trim());
            }}
            placeholder="e.g. who's cheapest if I only count vendors with no flagged lines?"
          />
          <button
            onClick={() => input.trim() && !loading && send(input.trim())}
            disabled={loading || !input.trim()}
            className="bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
