import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Vercel's serverless functions have a read-only filesystem except /tmp, and
// /tmp doesn't persist across cold starts or separate instances — acceptable
// for a demo (a fresh instance just starts back at "awaiting extraction"),
// but worth being explicit about. Locally, keep the DB in the repo for
// convenience across dev-server restarts.
const DB_PATH = process.env.VERCEL ? path.join("/tmp", "app.db") : path.resolve(process.cwd(), "data", "app.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  response_format TEXT NOT NULL,   -- excel | pdf | email | photo
  source_file TEXT NOT NULL,
  qualified INTEGER DEFAULT 1      -- did they clear the quality questionnaire (buyer-judged, defaults true)
);

CREATE TABLE IF NOT EXISTS extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id TEXT NOT NULL,
  rfx_line_id TEXT,                 -- null if the line couldn't be matched to any known RFx line
  vendor_description TEXT NOT NULL,
  unit_price REAL,
  currency TEXT,
  unit_price_basis TEXT,            -- per_unit | per_box_of_5 | other | unknown
  normalized_unit_price_inr REAL,   -- after currency + unit reconciliation (computed, not by the LLM)
  confidence REAL NOT NULL,
  source_citation TEXT,
  flags TEXT,                       -- JSON array of strings
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS unmatched_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id TEXT NOT NULL,
  rfx_line_id TEXT NOT NULL,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS questionnaire_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS vendor_notes (
  vendor_id TEXT PRIMARY KEY,
  notes TEXT,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);
`);
