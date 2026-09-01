import { NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { parseSource } from "@/lib/extraction/parse-source";
import { extractVendorResponse } from "@/lib/extraction/extract-vendor";
import { normalizeUnitPrice } from "@/lib/extraction/normalize";
import { VENDOR_META } from "@/lib/vendors";

const VENDORS = VENDOR_META;
const DOCS_DIR = path.resolve("data/vendor-docs");

// Claude calls for 4 vendors run in parallel below; the longest single call
// (usually the photo, via vision) is what sets the wall-clock time, not the
// sum of all four. Still needs headroom over Vercel's default 10s timeout.
export const maxDuration = 60;

// Runs the real extraction pipeline on demand — called from the Inbox screen's
// "Run extraction" button. Nothing here is precomputed: every call re-reads
// the source documents and re-calls Claude fresh.
export async function POST(req: Request) {
  const { vendorId } = await req.json().catch(() => ({ vendorId: null }));
  const targets = vendorId ? VENDORS.filter((v) => v.id === vendorId) : VENDORS;

  const settled = await Promise.allSettled(
    targets.map(async (vendor) => {
      const filePath = path.join(DOCS_DIR, vendor.file);
      const source = await parseSource(filePath);
      const result = await extractVendorResponse(vendor.name, source);
      return { vendor, result };
    })
  );

  const results: any[] = [];
  const errors: any[] = [];

  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      console.error("extraction failed:", outcome.reason);
      errors.push({ error: outcome.reason?.message ?? String(outcome.reason) });
      continue;
    }
    const { vendor, result } = outcome.value;

    db.prepare(`DELETE FROM extractions WHERE vendor_id = ?`).run(vendor.id);
    db.prepare(`DELETE FROM unmatched_lines WHERE vendor_id = ?`).run(vendor.id);
    db.prepare(`DELETE FROM questionnaire_answers WHERE vendor_id = ?`).run(vendor.id);
    db.prepare(`DELETE FROM vendor_notes WHERE vendor_id = ?`).run(vendor.id);
    db.prepare(`INSERT OR REPLACE INTO vendors (id, name, response_format, source_file) VALUES (?, ?, ?, ?)`).run(
      vendor.id,
      vendor.name,
      vendor.format,
      vendor.file
    );

    const insertLine = db.prepare(`
      INSERT INTO extractions (vendor_id, rfx_line_id, vendor_description, unit_price, currency, unit_price_basis, normalized_unit_price_inr, confidence, source_citation, flags)
      VALUES (@vendor_id, @rfx_line_id, @vendor_description, @unit_price, @currency, @unit_price_basis, @normalized_unit_price_inr, @confidence, @source_citation, @flags)
    `);
    for (const line of result.lines) {
      const normalized = normalizeUnitPrice(line.unit_price, line.currency, line.unit_price_basis);
      insertLine.run({
        vendor_id: vendor.id,
        rfx_line_id: line.matched_rfx_line_id,
        vendor_description: line.vendor_description,
        unit_price: line.unit_price,
        currency: line.currency,
        unit_price_basis: line.unit_price_basis,
        normalized_unit_price_inr: normalized.value,
        confidence: line.confidence,
        source_citation: line.source_citation,
        flags: JSON.stringify(line.flags),
      });
    }
    const insertUnmatched = db.prepare(`INSERT INTO unmatched_lines (vendor_id, rfx_line_id) VALUES (?, ?)`);
    for (const rfxId of result.unmatched_rfx_line_ids) insertUnmatched.run(vendor.id, rfxId);
    const insertQ = db.prepare(`INSERT INTO questionnaire_answers (vendor_id, question, answer) VALUES (?, ?, ?)`);
    for (const qa of result.questionnaire_answers) insertQ.run(vendor.id, qa.question, qa.answer);
    db.prepare(`INSERT INTO vendor_notes (vendor_id, notes) VALUES (?, ?)`).run(vendor.id, result.vendor_notes);

    results.push({ vendorId: vendor.id, linesExtracted: result.lines.length, unmatched: result.unmatched_rfx_line_ids.length });
  }

  return NextResponse.json({ ok: errors.length === 0, results, errors });
}

export async function GET() {
  const rows = db.prepare(`SELECT vendor_id, COUNT(*) as n, MAX(created_at) as last_run FROM extractions GROUP BY vendor_id`).all();
  return NextResponse.json({ status: rows });
}
