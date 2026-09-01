// Data-access layer for extraction results.
//
// Vercel's serverless functions have a read-only filesystem except /tmp —
// and critically, /tmp is per-instance and does NOT survive across separate
// invocations (a cold start, or simply landing on a different warm
// instance). The Inbox page's "Run extraction" call and the Comparison
// page's subsequent read are two separate requests with no guarantee they
// hit the same instance, so a local SQLite file in /tmp silently loses data
// between them — extraction reports success, but the comparison grid comes
// back empty. That's why this needs real persistent storage in production.
//
// Locally (no Postgres connection string configured), we fall back to the
// same better-sqlite3 file used throughout development, so `npm run dev`
// keeps working with zero setup. In production, connect a Postgres database
// under the project's Storage tab (Neon's marketplace integration, a couple
// of clicks, no separate account) and this switches to it automatically —
// see resolveConnectionString() below for which env var names it accepts.

export type ExtractionLine = {
  rfx_line_id: string | null;
  vendor_description: string;
  unit_price: number | null;
  currency: string | null;
  unit_price_basis: string | null;
  normalized_unit_price_inr: number | null;
  confidence: number;
  source_citation: string | null;
  flags: string[];
};

export type VendorRecord = {
  id: string;
  name: string;
  response_format: string;
  source_file: string;
  extractions: ExtractionLine[];
  notes: string | null;
  questionnaire: { question: string; answer: string }[];
};

// Different Postgres integrations name their env vars differently — Vercel's
// legacy first-party Postgres product (and @vercel/postgres's implicit env
// lookup) expects POSTGRES_URL, but the current Storage tab provisions
// Postgres through Neon's marketplace integration, which by default names
// its variable DATABASE_URL instead. Rather than depend on which one a given
// setup happens to create, we check both explicitly and pass whichever we
// find straight to the client as a connection string.
function resolveConnectionString(): string | null {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED ||
    null
  );
}

const usePostgres = !!resolveConnectionString();

// ---------------------------------------------------------------------------
// Postgres backend (production)
// ---------------------------------------------------------------------------

let _pool: any = null;
async function getPool() {
  if (_pool) return _pool;
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error("No Postgres connection string found (checked POSTGRES_URL, DATABASE_URL, and their _NON_POOLING/_UNPOOLED variants).");
  }
  const { createPool } = await import("@vercel/postgres");
  _pool = createPool({ connectionString });
  return _pool;
}

async function pgEnsureSchema() {
  const pool = await getPool();
  await pool.sql`CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    response_format TEXT NOT NULL,
    source_file TEXT NOT NULL,
    qualified INTEGER DEFAULT 1
  )`;
  await pool.sql`CREATE TABLE IF NOT EXISTS extractions (
    id SERIAL PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    rfx_line_id TEXT,
    vendor_description TEXT NOT NULL,
    unit_price DOUBLE PRECISION,
    currency TEXT,
    unit_price_basis TEXT,
    normalized_unit_price_inr DOUBLE PRECISION,
    confidence DOUBLE PRECISION NOT NULL,
    source_citation TEXT,
    flags TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await pool.sql`CREATE TABLE IF NOT EXISTS unmatched_lines (
    id SERIAL PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    rfx_line_id TEXT NOT NULL
  )`;
  await pool.sql`CREATE TABLE IF NOT EXISTS questionnaire_answers (
    id SERIAL PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL
  )`;
  await pool.sql`CREATE TABLE IF NOT EXISTS vendor_notes (
    vendor_id TEXT PRIMARY KEY,
    notes TEXT
  )`;
}

let pgSchemaReady: Promise<void> | null = null;
function ensurePgSchema() {
  if (!pgSchemaReady) pgSchemaReady = pgEnsureSchema();
  return pgSchemaReady;
}

async function pgReplaceVendorExtraction(
  vendor: { id: string; name: string; format: string; file: string },
  lines: ExtractionLine[],
  unmatchedRfxIds: string[],
  questionnaire: { question: string; answer: string }[],
  notes: string
) {
  const pool = await getPool();
  await ensurePgSchema();

  await pool.sql`DELETE FROM extractions WHERE vendor_id = ${vendor.id}`;
  await pool.sql`DELETE FROM unmatched_lines WHERE vendor_id = ${vendor.id}`;
  await pool.sql`DELETE FROM questionnaire_answers WHERE vendor_id = ${vendor.id}`;
  await pool.sql`DELETE FROM vendor_notes WHERE vendor_id = ${vendor.id}`;
  await pool.sql`
    INSERT INTO vendors (id, name, response_format, source_file)
    VALUES (${vendor.id}, ${vendor.name}, ${vendor.format}, ${vendor.file})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, response_format = EXCLUDED.response_format, source_file = EXCLUDED.source_file
  `;

  for (const line of lines) {
    await pool.sql`
      INSERT INTO extractions (vendor_id, rfx_line_id, vendor_description, unit_price, currency, unit_price_basis, normalized_unit_price_inr, confidence, source_citation, flags)
      VALUES (${vendor.id}, ${line.rfx_line_id}, ${line.vendor_description}, ${line.unit_price}, ${line.currency}, ${line.unit_price_basis}, ${line.normalized_unit_price_inr}, ${line.confidence}, ${line.source_citation}, ${JSON.stringify(line.flags)})
    `;
  }
  for (const rfxId of unmatchedRfxIds) {
    await pool.sql`INSERT INTO unmatched_lines (vendor_id, rfx_line_id) VALUES (${vendor.id}, ${rfxId})`;
  }
  for (const qa of questionnaire) {
    await pool.sql`INSERT INTO questionnaire_answers (vendor_id, question, answer) VALUES (${vendor.id}, ${qa.question}, ${qa.answer})`;
  }
  await pool.sql`INSERT INTO vendor_notes (vendor_id, notes) VALUES (${vendor.id}, ${notes})`;
}

async function pgGetExtractionStatus() {
  const pool = await getPool();
  await ensurePgSchema();
  const { rows } = await pool.sql`SELECT vendor_id, COUNT(*)::int as n, MAX(created_at) as last_run FROM extractions GROUP BY vendor_id`;
  return rows as { vendor_id: string; n: number; last_run: string }[];
}

async function pgGetVendorsWithData(): Promise<VendorRecord[]> {
  const pool = await getPool();
  await ensurePgSchema();
  const { rows: vendorRows } = await pool.sql`SELECT * FROM vendors ORDER BY id`;
  const out: VendorRecord[] = [];
  for (const v of vendorRows as any[]) {
    const { rows: extractionRows } = await pool.sql`SELECT * FROM extractions WHERE vendor_id = ${v.id}`;
    const { rows: notesRows } = await pool.sql`SELECT notes FROM vendor_notes WHERE vendor_id = ${v.id}`;
    const { rows: qaRows } = await pool.sql`SELECT question, answer FROM questionnaire_answers WHERE vendor_id = ${v.id}`;
    out.push({
      id: v.id,
      name: v.name,
      response_format: v.response_format,
      source_file: v.source_file,
      extractions: (extractionRows as any[]).map((r) => ({
        rfx_line_id: r.rfx_line_id,
        vendor_description: r.vendor_description,
        unit_price: r.unit_price,
        currency: r.currency,
        unit_price_basis: r.unit_price_basis,
        normalized_unit_price_inr: r.normalized_unit_price_inr,
        confidence: r.confidence,
        source_citation: r.source_citation,
        flags: JSON.parse(r.flags || "[]"),
      })),
      notes: (notesRows[0] as any)?.notes ?? null,
      questionnaire: qaRows as any[],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SQLite backend (local dev)
// ---------------------------------------------------------------------------

function sqliteReplaceVendorExtraction(
  vendor: { id: string; name: string; format: string; file: string },
  lines: ExtractionLine[],
  unmatchedRfxIds: string[],
  questionnaire: { question: string; answer: string }[],
  notes: string
) {
  const { db } = require("./db");
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
  for (const line of lines) {
    insertLine.run({
      vendor_id: vendor.id,
      rfx_line_id: line.rfx_line_id,
      vendor_description: line.vendor_description,
      unit_price: line.unit_price,
      currency: line.currency,
      unit_price_basis: line.unit_price_basis,
      normalized_unit_price_inr: line.normalized_unit_price_inr,
      confidence: line.confidence,
      source_citation: line.source_citation,
      flags: JSON.stringify(line.flags),
    });
  }
  const insertUnmatched = db.prepare(`INSERT INTO unmatched_lines (vendor_id, rfx_line_id) VALUES (?, ?)`);
  for (const rfxId of unmatchedRfxIds) insertUnmatched.run(vendor.id, rfxId);
  const insertQ = db.prepare(`INSERT INTO questionnaire_answers (vendor_id, question, answer) VALUES (?, ?, ?)`);
  for (const qa of questionnaire) insertQ.run(vendor.id, qa.question, qa.answer);
  db.prepare(`INSERT INTO vendor_notes (vendor_id, notes) VALUES (?, ?)`).run(vendor.id, notes);
}

function sqliteGetExtractionStatus() {
  const { db } = require("./db");
  return db.prepare(`SELECT vendor_id, COUNT(*) as n, MAX(created_at) as last_run FROM extractions GROUP BY vendor_id`).all() as {
    vendor_id: string;
    n: number;
    last_run: string;
  }[];
}

function sqliteGetVendorsWithData(): VendorRecord[] {
  const { db } = require("./db");
  const vendorRows = db.prepare(`SELECT * FROM vendors ORDER BY id`).all() as any[];
  return vendorRows.map((v) => {
    const extractionRows = db.prepare(`SELECT * FROM extractions WHERE vendor_id = ?`).all(v.id) as any[];
    const notesRow = db.prepare(`SELECT notes FROM vendor_notes WHERE vendor_id = ?`).get(v.id) as any;
    const qaRows = db.prepare(`SELECT question, answer FROM questionnaire_answers WHERE vendor_id = ?`).all(v.id) as any[];
    return {
      id: v.id,
      name: v.name,
      response_format: v.response_format,
      source_file: v.source_file,
      extractions: extractionRows.map((r) => ({
        rfx_line_id: r.rfx_line_id,
        vendor_description: r.vendor_description,
        unit_price: r.unit_price,
        currency: r.currency,
        unit_price_basis: r.unit_price_basis,
        normalized_unit_price_inr: r.normalized_unit_price_inr,
        confidence: r.confidence,
        source_citation: r.source_citation,
        flags: JSON.parse(r.flags || "[]"),
      })),
      notes: notesRow?.notes ?? null,
      questionnaire: qaRows,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API — picks backend based on POSTGRES_URL
// ---------------------------------------------------------------------------

export async function replaceVendorExtraction(
  vendor: { id: string; name: string; format: string; file: string },
  lines: ExtractionLine[],
  unmatchedRfxIds: string[],
  questionnaire: { question: string; answer: string }[],
  notes: string
) {
  if (usePostgres) return pgReplaceVendorExtraction(vendor, lines, unmatchedRfxIds, questionnaire, notes);
  return sqliteReplaceVendorExtraction(vendor, lines, unmatchedRfxIds, questionnaire, notes);
}

export async function getExtractionStatus() {
  if (usePostgres) return pgGetExtractionStatus();
  return sqliteGetExtractionStatus();
}

export async function getVendorsWithData(): Promise<VendorRecord[]> {
  if (usePostgres) return pgGetVendorsWithData();
  return sqliteGetVendorsWithData();
}
