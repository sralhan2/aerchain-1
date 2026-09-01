import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import mammoth from "mammoth";

export type ParsedSource =
  | { kind: "text"; text: string }
  | { kind: "image"; base64: string; mediaType: "image/jpeg" | "image/png" };

// Two prior parsers both failed in production:
//   - pdf-parse@1.x bundles an ancient (2017) pdf.js that threw a hard
//     "bad XRef entry" FormatError on our own pdfkit-generated vendor PDF.
//   - pdfjs-dist directly crashed Vercel's serverless runtime with
//     "ReferenceError: DOMMatrix is not defined" — it expects a
//     canvas-capable environment (via the optional @napi-rs/canvas native
//     package) even for plain text extraction, and Vercel's Node runtime
//     doesn't provide one.
// unpdf wraps pdf.js in a build specifically meant for serverless/edge
// runtimes with no canvas or DOM available — text extraction works without
// either dependency.
//
// Loaded lazily, inside the function that needs it, rather than as a
// top-level import: a module-level throw in a PDF library breaks the whole
// shared file before any per-vendor try/catch ever runs, taking every
// vendor down together instead of just the PDF one. Isolating it here means
// a PDF-parsing failure can only ever fail the PDF vendor.
async function parsePdf(filePath: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");

  const buf = fs.readFileSync(filePath);
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return text.trim();
}

export async function parseSource(filePath: string): Promise<ParsedSource> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    let out = "";
    wb.eachSheet((sheet) => {
      out += `\n--- Sheet: ${sheet.name} ---\n`;
      sheet.eachRow((row) => {
        const vals = (row.values as any[]).slice(1).map((v) => (v === null || v === undefined ? "" : String(v)));
        out += vals.join(" | ") + "\n";
      });
    });
    return { kind: "text", text: out.trim() };
  }

  if (ext === ".pdf") {
    try {
      const text = await parsePdf(filePath);
      return { kind: "text", text };
    } catch (err: any) {
      throw new Error(`PDF parsing failed (${err?.message ?? "unknown error"}) — see server logs for the full trace.`);
    }
  }

  if (ext === ".docx") {
    // mammoth extracts plain text from .docx with no native/canvas deps —
    // same serverless-safety reasoning as unpdf above for PDFs.
    const { value } = await mammoth.extractRawText({ path: filePath });
    return { kind: "text", text: value.trim() };
  }

  if (ext === ".txt") {
    return { kind: "text", text: fs.readFileSync(filePath, "utf-8").trim() };
  }

  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") {
    const buf = fs.readFileSync(filePath);
    return {
      kind: "image",
      base64: buf.toString("base64"),
      mediaType: ext === ".png" ? "image/png" : "image/jpeg",
    };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
