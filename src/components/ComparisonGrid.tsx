"use client";

import { useState } from "react";
import type { Cell, VendorSummary } from "@/lib/comparison";
import type { RfxLine } from "@/lib/rfx-data";

function money(n: number | null) {
  if (n === null) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const FLAG_EXPLAIN: Record<string, string> = {
  currency_mismatch: "Quoted in a different currency than the RFx — converted using a reference FX rate.",
  unit_mismatch: "Quoted per box/pack, not per unit as the RFx asked — converted to a per-unit price.",
  partial_quote: "Only part of this line was quoted.",
  ambiguous_pricing: "The vendor's wording doesn't resolve to one clear price.",
  footnote_discount: "A discount applies per the vendor's fine print, not reflected in the unit price shown.",
  low_image_confidence: "Read from a photo — worth a visual double-check.",
  other: "Flagged for review.",
};

function needsAttention(cell: Cell) {
  return cell.status === "not_quoted" || cell.flags.length > 0 || (cell.confidence !== null && cell.confidence < 0.9);
}

type CheapestMap = Record<string, { vendorId: string; priceInr: number } | null>;

export function ComparisonGrid({
  rfxLines,
  vendors,
  grid,
  cheapestPerLine,
  linesParam,
}: {
  rfxLines: RfxLine[];
  vendors: VendorSummary[];
  grid: Record<string, Record<string, Cell>>;
  cheapestPerLine: CheapestMap;
  linesParam: string | null;
}) {
  const [selected, setSelected] = useState<{ lineId: string; vendorId: string } | null>(null);
  // Buyer's award decision per line — defaults to the cheapest verified price, but the buyer can
  // override per line from the detail panel. Only lines with at least one quote get a default.
  const [awarded, setAwarded] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [lineId, best] of Object.entries(cheapestPerLine)) if (best) init[lineId] = best.vendorId;
    return init;
  });
  const [generating, setGenerating] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);

  const categories = Array.from(new Set(rfxLines.map((l) => l.category)));

  const selectedLine = selected ? rfxLines.find((l) => l.id === selected.lineId) : null;
  const selectedVendor = selected ? vendors.find((v) => v.id === selected.vendorId) : null;
  const selectedCell = selected ? grid[selected.lineId][selected.vendorId] : null;

  function cheapestVendorId(lineId: string): string | null {
    return cheapestPerLine[lineId]?.vendorId ?? null;
  }

  const awardedLineIds = Object.keys(awarded);
  const excludedCount = rfxLines.length - awardedLineIds.length;
  const prTotal = rfxLines.reduce((sum, line) => {
    const vId = awarded[line.id];
    if (!vId) return sum;
    const cell = grid[line.id][vId];
    return sum + (cell.normalizedPriceInr ?? 0) * line.qty;
  }, 0);

  async function generatePR() {
    setGenerating(true);
    setPrError(null);
    try {
      const res = await fetch("/api/generate-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awarded, lines: linesParam }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchase-requisition-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setPrError(err?.message ?? "Couldn't generate the PR — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
    <div className="px-8 pb-8 flex gap-4">
      <div className="flex-1 overflow-x-auto">
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="text-left font-mono text-[10px] uppercase tracking-wide text-neutral-400 px-4 py-3 w-[260px]">
                  Line item
                </th>
                {vendors.map((v) => (
                  <th key={v.id} className="text-left font-mono text-[10px] uppercase tracking-wide text-neutral-400 px-4 py-3">
                    {v.name}
                  </th>
                ))}
              </tr>
            </thead>
            {categories.map((cat) => (
              <tbody key={`cat-${cat}`}>
                <tr>
                  <td
                    colSpan={vendors.length + 1}
                    className="bg-neutral-50/70 px-4 py-1.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide"
                  >
                    {cat}
                  </td>
                </tr>
                {rfxLines
                  .filter((l) => l.category === cat)
                  .map((line) => {
                    const cheapest = cheapestVendorId(line.id);
                    const awardedVendorId = awarded[line.id];
                    return (
                      <tr key={line.id} className="border-b border-neutral-100 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-800">{line.description}</div>
                          <div className="text-xs text-neutral-400 mt-0.5">qty {line.qty}</div>
                        </td>
                        {vendors.map((v) => {
                          const cell = grid[line.id][v.id];
                          const isSelected = selected?.lineId === line.id && selected?.vendorId === v.id;
                          const isCheapest = cheapest === v.id;
                          const isAwarded = awardedVendorId === v.id;
                          const flagged = needsAttention(cell);

                          return (
                            <td key={v.id} className="px-4 py-3">
                              <button
                                onClick={() => setSelected({ lineId: line.id, vendorId: v.id })}
                                className={`group w-full text-left rounded-md px-2 py-1.5 -mx-2 transition-colors ${
                                  isSelected ? "bg-orange-50 ring-1 ring-orange-300" : isAwarded ? "bg-blue-50/60" : "hover:bg-neutral-50"
                                }`}
                              >
                                {cell.status === "not_quoted" ? (
                                  <span className="text-sm text-neutral-300">—</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className={`font-mono tabular-nums ${
                                        isCheapest ? "font-semibold text-emerald-700" : "text-neutral-800"
                                      }`}
                                    >
                                      {money(cell.normalizedPriceInr)}
                                    </span>
                                    {isCheapest && <span className="text-emerald-600 text-xs">✓</span>}
                                  </span>
                                )}
                                {isAwarded && (
                                  <div className="text-[9px] font-mono uppercase tracking-wide text-blue-600 mt-0.5">Awarded</div>
                                )}
                                {flagged && (
                                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </div>
        <p className="text-xs text-neutral-400 mt-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle mr-1" />
          means this figure needed a conversion, an assumption, or a lower-confidence read — click any price to see why.
          <span className="text-emerald-600 ml-3">✓</span> marks the lowest verified price on that line.
        </p>
      </div>

      {/* Detail panel */}
      <div className="w-[320px] shrink-0">
        <div className="sticky top-4 bg-white border border-neutral-200 rounded-lg p-4 min-h-[280px]">
          {!selected || !selectedCell || !selectedLine || !selectedVendor ? (
            <div className="text-sm text-neutral-400 flex items-center justify-center h-full min-h-[240px] text-center px-4">
              Click any price in the grid to see where it came from — the source text, confidence, and any conversion applied.
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wide text-neutral-400">{selectedVendor.name}</div>
                  <div className="font-semibold mt-0.5">{selectedLine.description}</div>
                </div>
                <a
                  href={`/vendor-docs/${selectedVendor.sourceFile}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-400 hover:text-orange-700 underline underline-offset-2 whitespace-nowrap shrink-0"
                >
                  View original doc ↗
                </a>
              </div>

              {selectedCell.status === "not_quoted" ? (
                <div className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                  Not quoted by this vendor. No price should be assumed for this line.
                </div>
              ) : (
                <>
                  <div className="mt-3 text-2xl font-mono font-semibold tabular-nums">{money(selectedCell.normalizedPriceInr)}</div>
                  {selectedCell.normalizedPriceInr !== selectedCell.unitPrice && (
                    <div className="text-xs text-neutral-500 mt-1">
                      Originally quoted as {selectedCell.currency === "USD" ? "$" : "₹"}
                      {selectedCell.unitPrice?.toLocaleString()}
                      {selectedCell.basis === "per_box_of_5" ? " per box of 5" : ""}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-neutral-400">confidence</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200">
                      {Math.round((selectedCell.confidence ?? 0) * 100)}%
                    </span>
                  </div>

                  {selectedCell.flags.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {selectedCell.flags.map((f) => (
                        <div key={f} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-2 py-1.5">
                          {FLAG_EXPLAIN[f] ?? f}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-neutral-100">
                    <div className="text-[10px] font-mono uppercase tracking-wide text-neutral-400 mb-1">
                      As written in the source document
                    </div>
                    <div className="text-sm text-neutral-700 italic">"{selectedCell.citation}"</div>
                    <div className="text-xs text-neutral-400 mt-1">Vendor's own description: {selectedCell.vendorDescription}</div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-100">
                    {awarded[selected!.lineId] === selected!.vendorId ? (
                      <div className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-center">
                        ✓ Awarded this line
                      </div>
                    ) : (
                      <button
                        onClick={() => setAwarded((a) => ({ ...a, [selected!.lineId]: selected!.vendorId }))}
                        className="w-full text-xs font-medium text-blue-700 border border-blue-200 rounded-md px-3 py-2 hover:bg-blue-50"
                      >
                        Award this line to {selectedVendor.name}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Purchase requisition summary bar */}
    <div className="px-8 pb-10">
      <div className="bg-white border border-neutral-200 rounded-lg p-5 flex items-center justify-between gap-6 flex-wrap">
        <div>
          <div className="text-xs font-mono uppercase tracking-wide text-neutral-400">Purchase requisition</div>
          <div className="text-sm text-neutral-600 mt-1">
            {awardedLineIds.length} of {rfxLines.length} line{rfxLines.length === 1 ? "" : "s"} awarded ·{" "}
            <span className="font-mono font-semibold text-neutral-800">{money(prTotal)}</span> total
            {excludedCount > 0 && (
              <span className="text-amber-600"> · {excludedCount} line{excludedCount === 1 ? "" : "s"} excluded (not quoted by any vendor)</span>
            )}
          </div>
          <div className="text-xs text-neutral-400 mt-1">
            Defaults to the lowest verified price per line — click any cell above, then "Award this line" to override.
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={generatePR}
            disabled={generating || awardedLineIds.length === 0}
            className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? "Generating…" : "Generate Purchase Requisition →"}
          </button>
          {prError && <span className="text-xs text-rose-600">⚠ {prError}</span>}
        </div>
      </div>
    </div>
    </>
  );
}
