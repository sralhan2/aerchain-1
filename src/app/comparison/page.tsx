import { getComparisonData, computeVendorTotals, computeCheapestPerLine } from "@/lib/comparison";
import { RFX } from "@/lib/rfx-data";
import { ComparisonGrid } from "@/components/ComparisonGrid";
import { AnalystChat } from "@/components/AnalystChat";

export const dynamic = "force-dynamic";

function money(n: number | null) {
  if (n === null) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default async function ComparisonPage({ searchParams }: { searchParams: Promise<{ lines?: string }> }) {
  const { lines: linesParam } = await searchParams;
  const selectedIds = linesParam ? linesParam.split(",").filter(Boolean) : null;
  const { rfxLines, vendors, grid, isFiltered } = await getComparisonData(selectedIds);

  const vendorTotals = computeVendorTotals(rfxLines, vendors, grid);
  const cheapestPerLine = computeCheapestPerLine(rfxLines, vendors, grid);

  const cheapestCoveredVendor = [...vendorTotals]
    .filter((v) => v.linesQuoted === rfxLines.length)
    .sort((a, b) => a.estTotal - b.estTotal)[0];

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white px-8 py-5">
        <div className="text-xs font-mono uppercase tracking-wider text-orange-700">RFx Copilot · Comparison</div>
        <h1 className="text-2xl font-semibold mt-1">{RFX.title}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {RFX.buyerOrg} · {rfxLines.length} line item{rfxLines.length === 1 ? "" : "s"}
          {isFiltered ? " matched to your draft" : ""} · {vendors.length} vendors responded
        </p>
      </header>

      {/* Buyer-first summary: what to decide, not what to audit */}
      <div className="grid grid-cols-4 gap-4 p-8 pb-4">
        {vendorTotals.map((v) => {
          const isCheapestFull = cheapestCoveredVendor?.id === v.id;
          return (
            <div
              key={v.id}
              className={`bg-white border rounded-lg p-4 ${isCheapestFull ? "border-emerald-300 ring-1 ring-emerald-100" : "border-neutral-200"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-400">{v.format}</span>
                {isCheapestFull && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Lowest — full quote
                  </span>
                )}
              </div>
              <div className="font-semibold mt-1">{v.name}</div>
              <div className="text-xl font-mono font-semibold mt-2 tabular-nums">{money(v.estTotal)}</div>
              <div className="text-xs text-neutral-400 mt-0.5">est. total for quoted lines, at RFx quantities</div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-100 text-xs">
                <span className={v.linesQuoted === v.linesTotal ? "text-emerald-600" : "text-neutral-500"}>
                  {v.linesQuoted}/{v.linesTotal} lines quoted
                </span>
                {v.reviewCount > 0 && <span className="text-amber-600">{v.reviewCount} to review</span>}
              </div>
            </div>
          );
        })}
      </div>

      <p className="px-8 text-xs text-neutral-400 -mt-1 mb-2">
        Totals only cover lines each vendor actually quoted — not an apples-to-apples number until gaps are resolved. That's exactly
        what the grid below is for.
      </p>

      <ComparisonGrid rfxLines={rfxLines} vendors={vendors} grid={grid} cheapestPerLine={cheapestPerLine} linesParam={linesParam ?? null} />

      <AnalystChat linesParam={linesParam ?? null} />
    </div>
  );
}
