import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { replaceVendorExtraction, getExtractionStatus } from "@/lib/store";
import { parseSource } from "@/lib/extraction/parse-source";
import { extractVendorResponse } from "@/lib/extraction/extract-vendor";
import { normalizeUnitPrice } from "@/lib/extraction/normalize";
import { VENDOR_META } from "@/lib/vendors";

const VENDORS = VENDOR_META;
const DOCS_DIR = path.resolve("data/vendor-docs");

// Claude calls for all vendors run in parallel below; the longest single call
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
      const extraFiles = (vendor as { extraFiles?: readonly string[] }).extraFiles;
      const extraText = extraFiles?.length
        ? extraFiles.map((f) => fs.readFileSync(path.join(DOCS_DIR, f), "utf-8").trim()).join("\n\n---\n\n")
        : undefined;
      const result = await extractVendorResponse(vendor.name, source, extraText);
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

    const lines = result.lines.map((line: any) => {
      const normalized = normalizeUnitPrice(line.unit_price, line.currency, line.unit_price_basis);
      return {
        rfx_line_id: line.matched_rfx_line_id,
        vendor_description: line.vendor_description,
        unit_price: line.unit_price,
        currency: line.currency,
        unit_price_basis: line.unit_price_basis,
        normalized_unit_price_inr: normalized.value,
        confidence: line.confidence,
        source_citation: line.source_citation,
        flags: line.flags,
      };
    });

    await replaceVendorExtraction(vendor, lines, result.unmatched_rfx_line_ids, result.questionnaire_answers, result.vendor_notes);

    results.push({ vendorId: vendor.id, linesExtracted: result.lines.length, unmatched: result.unmatched_rfx_line_ids.length });
  }

  return NextResponse.json({ ok: errors.length === 0, results, errors });
}

export async function GET() {
  const rows = await getExtractionStatus();
  return NextResponse.json({ status: rows });
}
