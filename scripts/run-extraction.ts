import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(".env.local") });

import fs from "fs";
import { db } from "../src/lib/db";
import { parseSource } from "../src/lib/extraction/parse-source";
import { extractVendorResponse } from "../src/lib/extraction/extract-vendor";
import { normalizeUnitPrice } from "../src/lib/extraction/normalize";

const VENDORS = [
  { id: "vendorA", name: "NexTech Systems", format: "excel", file: "vendor-a-nextech-quote.xlsx" },
  { id: "vendorB", name: "Meridian IT Supplies", format: "pdf", file: "vendor-b-meridian-quote.pdf" },
  { id: "vendorC", name: "Apex Global Traders", format: "email", file: "vendor-c-apex-email.txt" },
  { id: "vendorD", name: "Prime Traders", format: "photo", file: "vendor-d-prime-ratecard.jpg" },
];

const DOCS_DIR = path.resolve("data/vendor-docs");
const SNAPSHOT_DIR = path.resolve("data/extractions");
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

async function main() {
  // Reset tables for a clean re-run
  db.exec(`DELETE FROM extractions; DELETE FROM unmatched_lines; DELETE FROM questionnaire_answers; DELETE FROM vendor_notes; DELETE FROM vendors;`);

  for (const vendor of VENDORS) {
    console.log(`\n=== Extracting ${vendor.name} (${vendor.format}) ===`);
    const filePath = path.join(DOCS_DIR, vendor.file);
    const source = await parseSource(filePath);

    const result = await extractVendorResponse(vendor.name, source);

    fs.writeFileSync(path.join(SNAPSHOT_DIR, `${vendor.id}.json`), JSON.stringify(result, null, 2));

    db.prepare(`INSERT INTO vendors (id, name, response_format, source_file) VALUES (?, ?, ?, ?)`).run(
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

    console.log(`  -> ${result.lines.length} lines extracted, ${result.unmatched_rfx_line_ids.length} unmatched, currency=${result.currency_detected}`);
  }

  console.log("\nExtraction complete. Snapshots in data/extractions/, structured data in data/app.db");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
