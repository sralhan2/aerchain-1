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
      // Structured-output tool calls occasionally come back malformed or
      // truncated on the first try — most often for the longest/most
      // free-form source (a prose Word-doc quote has far more room for the
      // model to wander than a tidy spreadsheet). That's a transient model
      // hiccup, not a bug in this vendor's data, so it's worth one silent
      // retry before surfacing it to the buyer as a failure to act on.
      let result;
      try {
        result = await extractVendorResponse(vendor.name, source, extraText);
      } catch (firstErr) {
        console.warn(`extraction retry for ${vendor.name} after:`, firstErr);
        result = await extractVendorResponse(vendor.name, source, extraText);
      }

      // toolUse.input is an unchecked cast to ExtractionResult in
      // extract-vendor.ts — if the model's tool call ever comes back
      // malformed or truncated (long citation text pushing a 30-line
      // extraction past max_tokens, most likely on the fullest quotes),
      // result.lines can be missing or not an array. Validating and doing
      // the per-vendor transform HERE, inside the per-vendor promise, means
      // that failure is caught by allSettled below like any other per-vendor
      // error — it used to happen in a separate loop after allSettled had
      // already resolved, where a single malformed vendor result threw an
      // uncaught TypeError and crashed the whole batch (all 5 vendors) with
      // a bare 500, instead of failing just that one vendor.
      if (!Array.isArray(result.lines)) {
        throw new Error(
          `${vendor.name}: extraction returned no usable line data (the model's response may have been truncated) — try extracting this vendor again.`
        );
      }

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

      await replaceVendorExtraction(
        vendor,
        lines,
        Array.isArray(result.unmatched_rfx_line_ids) ? result.unmatched_rfx_line_ids : [],
        Array.isArray(result.questionnaire_answers) ? result.questionnaire_answers : [],
        result.vendor_notes ?? ""
      );

      return { vendorId: vendor.id, linesExtracted: result.lines.length, unmatched: result.unmatched_rfx_line_ids?.length ?? 0 };
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
    results.push(outcome.value);
  }

  return NextResponse.json({ ok: errors.length === 0, results, errors });
}

export async function GET() {
  const rows = await getExtractionStatus();
  return NextResponse.json({ status: rows });
}
