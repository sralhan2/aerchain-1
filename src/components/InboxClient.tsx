"use client";

import { useState } from "react";
import Link from "next/link";
import { VENDOR_META } from "@/lib/vendors";

type Status = "not_extracted" | "extracting" | "extracted";

const FORMAT_ICON: Record<string, string> = {
  excel: "▤",
  pdf: "▧",
  email: "✉",
  photo: "▨",
};

export function InboxClient({ initialStatus }: { initialStatus: Record<string, { linesExtracted: number } | null> }) {
  const [status, setStatus] = useState<Record<string, Status>>(() => {
    const s: Record<string, Status> = {};
    for (const v of VENDOR_META) s[v.id] = initialStatus[v.id] ? "extracted" : "not_extracted";
    return s;
  });
  const [lineCounts, setLineCounts] = useState<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    for (const v of VENDOR_META) c[v.id] = initialStatus[v.id]?.linesExtracted ?? 0;
    return c;
  });
  const [log, setLog] = useState<string[]>([]);

  async function runExtraction(vendorId?: string) {
    const targets = vendorId ? [vendorId] : VENDOR_META.map((v) => v.id);
    setStatus((s) => ({ ...s, ...Object.fromEntries(targets.map((id) => [id, "extracting"])) }));
    setLog((l) => [...l, `Calling extraction model for ${targets.length} vendor${targets.length > 1 ? "s" : ""}...`]);

    let data: any;
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: vendorId ?? null }),
      });
      if (!res.ok && res.status >= 500 && !(await res.clone().json().catch(() => null))) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      data = await res.json();
    } catch (err: any) {
      setLog((l) => [...l, `⚠ Extraction request failed: ${err?.message ?? "unknown error"}`]);
      setStatus((s) => ({ ...s, ...Object.fromEntries(targets.map((id) => [id, s[id] === "extracted" ? "extracted" : "not_extracted"])) }));
      return;
    }

    if (data.errors?.length) {
      setLog((l) => [...l, ...data.errors.map((e: any) => `⚠ ${e.error}`)]);
    }

    setStatus((s) => {
      const next = { ...s };
      for (const r of data.results) next[r.vendorId] = "extracted";
      // Any vendor still marked "extracting" that isn't in results failed — reset it
      for (const id of targets) if (next[id] === "extracting") next[id] = "not_extracted";
      return next;
    });
    setLineCounts((c) => {
      const next = { ...c };
      for (const r of data.results) next[r.vendorId] = r.linesExtracted;
      return next;
    });
    setLog((l) => [...l, ...data.results.map((r: any) => `${r.vendorId}: ${r.linesExtracted} lines extracted, ${r.unmatched} not quoted`)]);
  }

  const allExtracted = VENDOR_META.every((v) => status[v.id] === "extracted");
  const anyExtracting = VENDOR_META.some((v) => status[v.id] === "extracting");

  return (
    <div className="px-8 pb-8">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => runExtraction()}
          disabled={anyExtracting}
          className="text-sm font-medium bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {anyExtracting ? "Extracting…" : "Run extraction on all responses"}
        </button>
        {allExtracted && (
          <Link href="/comparison" className="text-sm font-medium text-emerald-700 hover:underline">
            View comparison →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {VENDOR_META.map((v) => (
          <div key={v.id} className="bg-white border border-neutral-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg text-neutral-400">{FORMAT_ICON[v.format]}</span>
                  <span className="font-semibold">{v.name}</span>
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {v.formatLabel} · received {v.receivedAt}
                </div>
              </div>
              {status[v.id] === "extracted" && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                  {lineCounts[v.id]} lines extracted
                </span>
              )}
              {status[v.id] === "extracting" && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap animate-pulse">
                  extracting…
                </span>
              )}
              {status[v.id] === "not_extracted" && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 border border-neutral-200 whitespace-nowrap">
                  awaiting extraction
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-3">
              <a
                href={`/vendor-docs/${v.file}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-neutral-500 hover:text-orange-700 underline underline-offset-2"
              >
                View raw file ({v.file})
              </a>
              {status[v.id] !== "extracted" && (
                <button
                  onClick={() => runExtraction(v.id)}
                  disabled={status[v.id] === "extracting"}
                  className="text-xs font-medium text-orange-700 hover:underline disabled:opacity-50"
                >
                  Extract this one
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {log.length > 0 && (
        <div className="mt-4 bg-neutral-900 text-neutral-300 rounded-lg p-4 font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
          {log.map((l, i) => (
            <div key={i}>
              <span className="text-neutral-500">{`>`}</span> {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
