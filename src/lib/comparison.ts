import { getVendorsWithData } from "./store";
import { RFX } from "./rfx-data";

export type Cell = {
  status: "quoted" | "not_quoted";
  unitPrice: number | null;
  currency: string | null;
  normalizedPriceInr: number | null;
  basis: string | null;
  confidence: number | null;
  citation: string | null;
  flags: string[];
  vendorDescription: string | null;
};

export type VendorSummary = {
  id: string;
  name: string;
  format: string;
  sourceFile: string;
  currencyDetected: string | null;
  linesQuoted: number;
  linesTotal: number;
  avgConfidence: number | null;
  notes: string | null;
  questionnaire: { question: string; answer: string }[];
};

export async function getComparisonData(selectedLineIds?: string[] | null, qtyOverrides?: Record<string, number>) {
  const vendorRecords = await getVendorsWithData();
  const baseLines = selectedLineIds && selectedLineIds.length ? RFX.lines.filter((l) => selectedLineIds.includes(l.id)) : RFX.lines;
  // The fixed demo catalog's quantities are what the pre-fabricated vendor
  // docs were priced against — but when a buyer's own draft asked for a
  // different quantity on an unambiguously-matched line, show and total
  // against what they actually asked for. Unit prices themselves don't
  // change (this demo doesn't model volume-based pricing breaks).
  const rfxLines = qtyOverrides && Object.keys(qtyOverrides).length
    ? baseLines.map((l) => (qtyOverrides[l.id] ? { ...l, qty: qtyOverrides[l.id] } : l))
    : baseLines;

  const vendors: VendorSummary[] = vendorRecords.map((v) => {
    const confidences = v.extractions.map((e) => e.confidence).filter((c) => typeof c === "number");
    return {
      id: v.id,
      name: v.name,
      format: v.response_format,
      sourceFile: v.source_file,
      currencyDetected: v.extractions[0]?.currency ?? null,
      linesQuoted: v.extractions.filter((e) => e.rfx_line_id && rfxLines.some((l) => l.id === e.rfx_line_id)).length,
      linesTotal: rfxLines.length,
      avgConfidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
      notes: v.notes,
      questionnaire: v.questionnaire,
    };
  });

  const grid: Record<string, Record<string, Cell>> = {};
  for (const line of rfxLines) {
    grid[line.id] = {};
    for (const v of vendorRecords) {
      const row = v.extractions.find((e) => e.rfx_line_id === line.id);
      if (!row) {
        grid[line.id][v.id] = {
          status: "not_quoted",
          unitPrice: null,
          currency: null,
          normalizedPriceInr: null,
          basis: null,
          confidence: null,
          citation: null,
          flags: [],
          vendorDescription: null,
        };
      } else {
        grid[line.id][v.id] = {
          status: "quoted",
          unitPrice: row.unit_price,
          currency: row.currency,
          normalizedPriceInr: row.normalized_unit_price_inr,
          basis: row.unit_price_basis,
          confidence: row.confidence,
          citation: row.source_citation,
          flags: row.flags,
          vendorDescription: row.vendor_description,
        };
      }
    }
  }

  return { rfxLines, vendors, grid, isFiltered: !!(selectedLineIds && selectedLineIds.length) };
}

export type ComparisonData = Awaited<ReturnType<typeof getComparisonData>>;

// Single source of truth for "who's cheapest on this line" — used by the
// grid's ✓ marker, the Purchase Requisition's default vendor selections, and
// the analyst chat's grounding context, so all three always agree.
export function computeCheapestPerLine(
  rfxLines: { id: string }[],
  vendors: { id: string }[],
  grid: Record<string, Record<string, Cell>>,
  minConfidence = 0.7
): Record<string, { vendorId: string; priceInr: number } | null> {
  const out: Record<string, { vendorId: string; priceInr: number } | null> = {};
  for (const line of rfxLines) {
    let best: { vendorId: string; priceInr: number } | null = null;
    for (const v of vendors) {
      const c = grid[line.id][v.id];
      if (c.status === "quoted" && c.normalizedPriceInr !== null && (c.confidence === null || c.confidence >= minConfidence)) {
        if (!best || c.normalizedPriceInr < best.priceInr) best = { vendorId: v.id, priceInr: c.normalizedPriceInr };
      }
    }
    out[line.id] = best;
  }
  return out;
}

// Vendor totals across whatever lines are in scope (respects filtering).
export function computeVendorTotals(rfxLines: { id: string; qty: number }[], vendors: VendorSummary[], grid: Record<string, Record<string, Cell>>) {
  return vendors.map((v) => {
    let total = 0;
    let reviewCount = 0;
    for (const line of rfxLines) {
      const cell = grid[line.id][v.id];
      if (cell.status === "quoted" && cell.normalizedPriceInr !== null) total += cell.normalizedPriceInr * line.qty;
      if (cell.flags.length > 0 || (cell.confidence !== null && cell.confidence < 0.9)) reviewCount++;
    }
    return { ...v, estTotal: total, reviewCount };
  });
}
