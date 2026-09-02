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
type Allocation = { vendorId: string; qty: number };

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

  // Award decision per line, as a list of (vendor, qty) allocations rather
  // than a single vendor — a line can be split across more than one vendor
  // (e.g. one vendor can't cover the full quantity, or the buyer wants to
  // de-risk a single-vendor dependency), or awarded to nobody at all if the
  // buyer deliberately excludes it. Defaults to the full line quantity
  // single-sourced to whoever's cheapest and verified; the buyer adjusts
  // from there via the detail panel.
  const [awarded, setAwarded] = useState<Record<string, Allocation[]>>(() => {
    const init: Record<string, Allocation[]> = {};
    for (const line of rfxLines) {
      const best = cheapestPerLine[line.id];
      init[line.id] = best ? [{ vendorId: best.vendorId, qty: line.qty }] : [];
    }
    return init;
  });
  const [generating, setGenerating] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);

  // What-if quantity: lets the buyer resize a line before awarding (a budget
  // cut, a pilot batch, checking a volume breakpoint) without re-running
  // extraction. This recomputes extended totals using the SAME per-unit
  // price already on file — it is explicitly NOT a re-quote. Real vendor
  // pricing can change with volume (Horizon's own laptop quote is a range
  // "depending on final committed quantity" for exactly this reason), so
  // any line the buyer resizes is marked and called out, never blended in
  // silently.
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});

  function effectiveQty(lineId: string, fallback: number): number {
    const override = qtyOverrides[lineId];
    return typeof override === "number" && override > 0 ? override : fallback;
  }

  function allocationFor(lineId: string, vendorId: string): number | null {
    const a = (awarded[lineId] ?? []).find((x) => x.vendorId === vendorId);
    return a ? a.qty : null;
  }

  // Sets (or clears, at qty 0) this line's allocation to one vendor without
  // touching any other vendor already sharing the line — that's what makes
  // a split possible: award 15 to Prime and 5 to Meridian on the same line
  // by calling this twice.
  function setAllocation(lineId: string, vendorId: string, qty: number) {
    setAwarded((prev) => {
      const others = (prev[lineId] ?? []).filter((a) => a.vendorId !== vendorId);
      return { ...prev, [lineId]: qty > 0 ? [...others, { vendorId, qty }] : others };
    });
  }

  function deselectLine(lineId: string) {
    setAwarded((prev) => ({ ...prev, [lineId]: [] }));
  }

  function handleQtyChange(line: RfxLine, raw: string) {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    setQtyOverrides((prev) => {
      const next = { ...prev };
      if (v !== line.qty) next[line.id] = v;
      else delete next[line.id];
      return next;
    });
    // Single-vendor lines track the resized quantity automatically — that's
    // the common case (buyer just wants a smaller version of the same
    // award). A line already split across vendors is left alone: the buyer
    // is managing it by hand at that point, and silently rescaling one split
    // while leaving the other fixed would be a worse assumption than doing
    // nothing and surfacing the mismatch instead.
    setAwarded((prev) => {
      const allocs = prev[line.id] ?? [];
      if (allocs.length === 1) return { ...prev, [line.id]: [{ ...allocs[0], qty: v }] };
      return prev;
    });
  }

  const categories = Array.from(new Set(rfxLines.map((l) => l.category)));

  const selectedLine = selected ? rfxLines.find((l) => l.id === selected.lineId) : null;
  const selectedVendor = selected ? vendors.find((v) => v.id === selected.vendorId) : null;
  const selectedCell = selected ? grid[selected.lineId][selected.vendorId] : null;
  const selectedAllocations = selectedLine ? awarded[selectedLine.id] ?? [] : [];
  const selectedAllocatedSum = selectedAllocations.reduce((s, a) => s + a.qty, 0);
  const selectedLineTotal = selectedLine ? effectiveQty(selectedLine.id, selectedLine.qty) : 0;
  const selectedRemaining = selectedLineTotal - selectedAllocatedSum;

  function cheapestVendorId(lineId: string): string | null {
    return cheapestPerLine[lineId]?.vendorId ?? null;
  }

  const awardedLineIds = rfxLines.filter((l) => (awarded[l.id] ?? []).length > 0).map((l) => l.id);
  const noQuoteCount = rfxLines.filter((l) => !cheapestPerLine[l.id]).length;
  const deselectedCount = rfxLines.filter((l) => cheapestPerLine[l.id] && (awarded[l.id] ?? []).length === 0).length;
  const partiallyAllocated = rfxLines.filter((l) => {
    const allocs = awarded[l.id] ?? [];
    if (allocs.length === 0) return false;
    const sum = allocs.reduce((s, a) => s + a.qty, 0);
    return sum !== effectiveQty(l.id, l.qty);
  });
  const resizedCount = Object.keys(qtyOverrides).length;
  const prTotal = rfxLines.reduce((sum, line) => {
    const allocs = awarded[line.id] ?? [];
    return (
      sum +
      allocs.reduce((s, a) => {
        const cell = grid[line.id][a.vendorId];
        return s + (cell.normalizedPriceInr ?? 0) * a.qty;
      }, 0)
    );
  }, 0);

  async function generatePR() {
    setGenerating(true);
    setPrError(null);
    try {
      const res = await fetch("/api/generate-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awarded, lines: linesParam, qtyOverrides }),
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
                    const allocs = awarded[line.id] ?? [];
                    const lineTotal = effectiveQty(line.id, line.qty);
                    const allocatedSum = allocs.reduce((s, a) => s + a.qty, 0);
                    const isSplit = allocs.length > 1;
                    const isDeselected = allocs.length === 0 && !!cheapestPerLine[line.id];
                    const isPartial = allocs.length > 0 && allocatedSum !== lineTotal;
                    return (
                      <tr key={line.id} className="border-b border-neutral-100 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-neutral-800">{line.description}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-neutral-400">qty</span>
                            <input
                              type="number"
                              min={1}
                              value={lineTotal}
                              onChange={(e) => handleQtyChange(line, e.target.value)}
                              className="w-14 text-xs font-mono tabular-nums border border-transparent hover:border-neutral-200 focus:border-orange-300 rounded px-1 py-0.5 -ml-1 bg-transparent focus:bg-white focus:outline-none"
                            />
                            {qtyOverrides[line.id] !== undefined && (
                              <span className="text-[9px] font-mono uppercase tracking-wide text-orange-600 bg-orange-50 border border-orange-200 rounded px-1 py-0.5">
                                edited from {line.qty}
                              </span>
                            )}
                            {isSplit && (
                              <span className="text-[9px] font-mono uppercase tracking-wide text-purple-600 bg-purple-50 border border-purple-200 rounded px-1 py-0.5">
                                split {allocs.length} ways
                              </span>
                            )}
                            {isDeselected && (
                              <span className="text-[9px] font-mono uppercase tracking-wide text-neutral-500 bg-neutral-100 border border-neutral-200 rounded px-1 py-0.5">
                                deselected
                              </span>
                            )}
                            {isPartial && (
                              <span className="text-[9px] font-mono uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
                                {allocatedSum}/{lineTotal} allocated
                              </span>
                            )}
                          </div>
                        </td>
                        {vendors.map((v) => {
                          const cell = grid[line.id][v.id];
                          const isSelected = selected?.lineId === line.id && selected?.vendorId === v.id;
                          const isCheapest = cheapest === v.id;
                          const allocQty = allocationFor(line.id, v.id);
                          const isAwarded = allocQty !== null;
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
                                  <div className="text-[9px] font-mono uppercase tracking-wide text-blue-600 mt-0.5">
                                    Awarded {allocQty}
                                  </div>
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

                  {/* Allocation editor — award for the whole line, not just the clicked vendor */}
                  <div className="mt-4 pt-3 border-t border-neutral-100">
                    <div className="text-[10px] font-mono uppercase tracking-wide text-neutral-400 mb-2">Award for this line</div>

                    {selectedAllocations.length === 0 && (
                      <div className="text-xs text-neutral-400 italic mb-2">Deselected — not included in the PR.</div>
                    )}

                    {selectedAllocations.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {selectedAllocations.map((a) => {
                          const vName = vendors.find((v) => v.id === a.vendorId)?.name ?? a.vendorId;
                          return (
                            <div
                              key={a.vendorId}
                              className="flex items-center justify-between text-xs bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5"
                            >
                              <span className="font-medium text-blue-800">{vName}</span>
                              <span className="flex items-center gap-2">
                                <span className="font-mono tabular-nums text-blue-700">{a.qty}</span>
                                <button
                                  onClick={() => setAllocation(selectedLine.id, a.vendorId, 0)}
                                  aria-label={`Remove ${vName} from this line's award`}
                                  className="text-blue-400 hover:text-rose-600"
                                >
                                  ✕
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {selectedRemaining !== 0 && (
                      <div className={`text-xs mb-2 ${selectedRemaining > 0 ? "text-amber-600" : "text-rose-600"}`}>
                        {selectedRemaining > 0
                          ? `${selectedRemaining} of ${selectedLineTotal} units not yet allocated to any vendor.`
                          : `Over-allocated by ${-selectedRemaining} units — allocations add up to more than the line's quantity.`}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">Allocate to {selectedVendor.name}:</span>
                      <input
                        type="number"
                        min={0}
                        value={allocationFor(selectedLine.id, selectedVendor.id) ?? 0}
                        onChange={(e) => {
                          const q = Number(e.target.value);
                          setAllocation(selectedLine.id, selectedVendor.id, Number.isFinite(q) ? Math.max(0, q) : 0);
                        }}
                        className="w-16 text-xs font-mono tabular-nums border border-neutral-200 rounded px-1.5 py-1 focus:border-orange-300 focus:outline-none"
                      />
                      <span className="text-xs text-neutral-400">units</span>
                    </div>
                    {selectedRemaining > 0 && (
                      <button
                        onClick={() =>
                          setAllocation(
                            selectedLine.id,
                            selectedVendor.id,
                            (allocationFor(selectedLine.id, selectedVendor.id) ?? 0) + selectedRemaining
                          )
                        }
                        className="text-xs text-blue-700 hover:underline mt-1.5"
                      >
                        Fill remaining {selectedRemaining} to {selectedVendor.name} →
                      </button>
                    )}

                    <button
                      onClick={() => deselectLine(selectedLine.id)}
                      className="w-full text-xs font-medium text-neutral-500 border border-neutral-200 rounded-md px-3 py-2 hover:bg-neutral-50 mt-3"
                    >
                      Deselect this line entirely
                    </button>
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
            {noQuoteCount > 0 && (
              <span className="text-amber-600"> · {noQuoteCount} line{noQuoteCount === 1 ? "" : "s"} excluded (not quoted by any vendor)</span>
            )}
            {deselectedCount > 0 && (
              <span className="text-neutral-500"> · {deselectedCount} line{deselectedCount === 1 ? "" : "s"} deselected by you</span>
            )}
          </div>
          <div className="text-xs text-neutral-400 mt-1">
            Defaults to the lowest verified price per line — click any cell above to award or split that line, or deselect it
            entirely. Quantities are editable too — change one to model a different order size.
          </div>
          {resizedCount > 0 && (
            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-2.5 py-1.5 mt-2 inline-block">
              {resizedCount} line{resizedCount === 1 ? "" : "s"} resized from the original RFx quantity — totals above are an{" "}
              <span className="font-medium">estimate at the vendor's quoted unit price</span>. Actual pricing can change at a
              different volume; treat this as a what-if, not a confirmed quote, until the vendor requotes.
            </div>
          )}
          {partiallyAllocated.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-2 inline-block">
              {partiallyAllocated.length} line{partiallyAllocated.length === 1 ? "" : "s"} don't add up to their full quantity yet
              (split awarded to less — or more — than what was asked for). Fix these before generating the PR.
            </div>
          )}
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
