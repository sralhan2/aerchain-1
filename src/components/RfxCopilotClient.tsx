"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { serializeLinesParam } from "@/lib/line-selection";

type Turn = { role: "user" | "assistant"; content: string };
type Draft = {
  title: string;
  scope: string;
  delivery_window: string;
  delivery_location: string;
  questionnaire: string[];
  lines: { category: string; description: string; spec: string; qty: number; unit: string }[];
};

export function RfxCopilotClient() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sendToVendors() {
    if (!draft) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/match-rfx-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: draft.lines.map((l) => ({ category: l.category, description: l.description, spec: l.spec, qty: l.qty })),
        }),
      });
      if (!res.ok) throw new Error(`Matching request failed (${res.status})`);
      const { rfxLineIds, qtyOverrides } = await res.json();
      const query = rfxLineIds?.length ? `?lines=${encodeURIComponent(serializeLinesParam(rfxLineIds, qtyOverrides ?? {}))}` : "";
      router.push(`/inbox${query}`);
    } catch (err: any) {
      // If matching fails, fall back to showing the full fixed catalog rather than blocking the demo.
      setSendError(err?.message ?? "Couldn't match your draft to the vendor catalog — showing all catalog lines instead.");
      router.push("/inbox");
    } finally {
      setSending(false);
    }
  }

  async function send(text: string) {
    const nextTurns: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/rfx-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: nextTurns }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Request failed (${res.status}): ${errBody.slice(0, 200)}`);
      }

      const result = await res.json();
      setTurns((t) => [...t, { role: "assistant", content: result.message }]);
      if (result.type === "draft" && result.rfx_draft) {
        setDraft(result.rfx_draft);
      }
    } catch (err: any) {
      setTurns((t) => [
        ...t,
        { role: "assistant", content: `⚠ ${err?.message ?? "Something went wrong reaching the model. Please try again."}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="text-xs font-mono uppercase tracking-wider text-orange-700">RFx Copilot · Draft</div>
      <h1 className="text-2xl font-semibold mt-1">Tell me what you need to buy</h1>
      <p className="text-sm text-neutral-500 mt-1 mb-6">
        Describe it like you would to a colleague. I'll ask what's missing, then draft the RFx.
      </p>

      <div className="space-y-4 mb-6">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
                t.role === "user" ? "bg-orange-600 text-white" : "bg-white border border-neutral-200 text-neutral-800"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-neutral-200 rounded-lg px-4 py-2.5 text-sm text-neutral-400 animate-pulse">
              thinking…
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border border-neutral-300 rounded-md px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim() && !loading) send(input.trim());
          }}
          placeholder={draft ? "Ask for changes — e.g. \"add 20 more monitors\" or \"drop the warranty line\"…" : "Describe what you need to buy…"}
        />
        <button
          onClick={() => input.trim() && !loading && send(input.trim())}
          disabled={loading || !input.trim()}
          className="bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50"
        >
          Send
        </button>
      </div>
      {draft && (
        <p className="text-xs text-neutral-400 mt-2">
          The draft below updates in place with each change you ask for — nothing is final until you send it.
        </p>
      )}

      {draft && (
        <div className="bg-white border border-neutral-200 rounded-lg p-5 mt-4">
          <div className="text-xs font-mono uppercase tracking-wide text-neutral-400 mb-1">Drafted RFx</div>
          <div className="font-semibold text-lg">{draft.title}</div>
          <p className="text-sm text-neutral-600 mt-1">{draft.scope}</p>
          <div className="text-xs text-neutral-400 mt-2">
            {draft.delivery_location} · {draft.delivery_window}
          </div>

          <div className="mt-4">
            <div className="text-xs font-mono uppercase tracking-wide text-neutral-400 mb-2">
              Line items ({draft.lines.length})
            </div>
            <div className="border border-neutral-200 rounded-md divide-y divide-neutral-100 max-h-64 overflow-y-auto">
              {draft.lines.map((l, i) => (
                <div key={i} className="px-3 py-2 text-sm flex justify-between gap-4">
                  <div>
                    <div className="font-medium">{l.description}</div>
                    <div className="text-xs text-neutral-400">{l.spec}</div>
                  </div>
                  <div className="text-xs text-neutral-500 whitespace-nowrap">
                    qty {l.qty} {l.unit}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs font-mono uppercase tracking-wide text-neutral-400 mb-2">Questionnaire</div>
            <ul className="text-sm text-neutral-600 list-disc pl-5 space-y-0.5">
              {draft.questionnaire.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>

          <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center justify-between gap-4">
            <p className="text-xs text-neutral-400 max-w-sm">
              For this demo, sending routes to the pre-seeded vendor inbox (4 fabricated responses already on file) rather than a
              freshly generated one — see the one-pager for why. The comparison screen will only show the catalog lines that match
              what you actually asked for above.
            </p>
            <button
              onClick={sendToVendors}
              disabled={sending}
              className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
            >
              {sending ? "Matching to vendors…" : "Send to vendors →"}
            </button>
          </div>
          {sendError && <p className="text-xs text-amber-600 mt-2">⚠ {sendError}</p>}
        </div>
      )}
    </div>
  );
}
