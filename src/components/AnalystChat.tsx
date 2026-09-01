"use client";

import { useState } from "react";

type AnalystTable = { columns: string[]; rows: (string | number)[][] };
type AnalystChartData = { title: string; unit?: string; categories: string[]; values: number[] };
type Turn = {
  role: "user" | "assistant";
  content: string;
  format?: "text" | "table" | "chart";
  table?: AnalystTable | null;
  chart?: AnalystChartData | null;
};

const SUGGESTIONS = [
  "Show me a table of the cheapest verified price per line item.",
  "Chart each vendor's estimated total so I can compare them at a glance.",
  "Which vendors offer on-site support?",
];

function tableToCsv(table: AnalystTable): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [table.columns.map(esc).join(","), ...table.rows.map((r) => r.map(esc).join(","))].join("\n");
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function AnswerTable({ table }: { table: AnalystTable }) {
  return (
    <div className="mt-2">
      <div className="overflow-x-auto border border-neutral-200 rounded-md">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {table.columns.map((c, i) => (
                <th key={i} className="text-left font-mono uppercase tracking-wide text-neutral-400 px-2.5 py-1.5">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-b border-neutral-100 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-2.5 py-1.5 text-neutral-700 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => downloadText("analyst-table.csv", tableToCsv(table), "text/csv")}
        className="text-[11px] text-blue-700 hover:underline mt-1.5"
      >
        Download as CSV
      </button>
    </div>
  );
}

function AnswerChart({ chart }: { chart: AnalystChartData }) {
  const max = Math.max(...chart.values, 1);
  return (
    <div className="mt-2">
      <div className="text-[11px] font-mono uppercase tracking-wide text-neutral-400 mb-1.5">{chart.title}</div>
      <div className="space-y-1.5">
        {chart.categories.map((cat, i) => {
          const val = chart.values[i] ?? 0;
          const pct = Math.max((val / max) * 100, 2);
          return (
            <div key={cat} className="flex items-center gap-2 text-xs">
              <div className="w-28 shrink-0 truncate text-neutral-600" title={cat}>
                {cat}
              </div>
              <div className="flex-1 bg-neutral-100 rounded h-4 relative overflow-hidden">
                <div className="bg-orange-500 h-full rounded" style={{ width: `${pct}%` }} />
              </div>
              <div className="w-24 shrink-0 text-right font-mono tabular-nums text-neutral-700">
                {chart.unit === "INR" ? `₹${val.toLocaleString("en-IN")}` : val.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={() =>
          downloadText(
            "analyst-chart.csv",
            tableToCsv({ columns: ["category", chart.unit ?? "value"], rows: chart.categories.map((c, i) => [c, chart.values[i] ?? 0]) }),
            "text/csv"
          )
        }
        className="text-[11px] text-blue-700 hover:underline mt-2"
      >
        Download as CSV
      </button>
    </div>
  );
}

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
        // History only needs role+content — table/chart payloads are UI-only, not conversational context.
        body: JSON.stringify({ question: text, history: turns.map((t) => ({ role: t.role, content: t.content })), lines: linesParam }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setTurns((t) => [...t, { role: "assistant", content: data.answer, format: data.format, table: data.table, chart: data.chart }]);
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
          Ask a question about this comparison in plain language — grounded in the actual extracted quotes, not a guess. Answers can
          come back as text, a table, or a chart, whichever fits the question — and any table or chart can be downloaded as CSV.
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
          <div className="space-y-3 mb-4 max-h-[32rem] overflow-y-auto">
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-lg px-3.5 py-2 text-sm whitespace-pre-wrap ${
                    t.role === "user" ? "bg-orange-600 text-white" : "bg-neutral-50 border border-neutral-200 text-neutral-800"
                  }`}
                >
                  {t.content}
                  {t.role === "assistant" && t.format === "table" && t.table && <AnswerTable table={t.table} />}
                  {t.role === "assistant" && t.format === "chart" && t.chart && <AnswerChart chart={t.chart} />}
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
