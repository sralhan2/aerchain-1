import { db } from "./db";
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

export function getComparisonData() {
  const vendorRows = db.prepare(`SELECT * FROM vendors ORDER BY id`).all() as any[];

  const vendors: VendorSummary[] = vendorRows.map((v) => {
    const extractions = db.prepare(`SELECT * FROM extractions WHERE vendor_id = ?`).all(v.id) as any[];
    const notesRow = db.prepare(`SELECT notes FROM vendor_notes WHERE vendor_id = ?`).get(v.id) as any;
    const questionnaire = db.prepare(`SELECT question, answer FROM questionnaire_answers WHERE vendor_id = ?`).all(v.id) as any[];
    const confidences = extractions.map((e) => e.confidence).filter((c) => typeof c === "number");
    return {
      id: v.id,
      name: v.name,
      format: v.response_format,
      sourceFile: v.source_file,
      currencyDetected: extractions[0]?.currency ?? null,
      linesQuoted: extractions.filter((e) => e.rfx_line_id).length,
      linesTotal: RFX.lines.length,
      avgConfidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
      notes: notesRow?.notes ?? null,
      questionnaire,
    };
  });

  const grid: Record<string, Record<string, Cell>> = {};
  for (const line of RFX.lines) {
    grid[line.id] = {};
    for (const v of vendorRows) {
      const row = db.prepare(`SELECT * FROM extractions WHERE vendor_id = ? AND rfx_line_id = ?`).get(v.id, line.id) as any;
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
          flags: JSON.parse(row.flags || "[]"),
          vendorDescription: row.vendor_description,
        };
      }
    }
  }

  return { rfxLines: RFX.lines, vendors, grid };
}
