import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
// pdf-parse@1.x bundles an ancient (2017) copy of pdf.js that throws a hard
// "bad XRef entry" FormatError on some validly-structured PDFs (it hit our
// own pdfkit-generated vendor quote in production). pdfjs-dist is Mozilla's
// actively maintained parser — using it directly avoids that fragile
// dependency entirely.
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// Node has no browser Worker global, so pdfjs-dist falls back to a "fake
// worker" that dynamically loads this file in-process — it still needs a
// resolvable path to it, even though nothing actually runs in a separate
// thread here. Building the path from process.cwd() rather than
// require.resolve()/import.meta.url — Turbopack's build-time page-data
// collection evaluates this module outside the normal module graph, where
// those dynamic resolutions come back empty and the pdfjs-dist setter
// throws on a non-string value.
GlobalWorkerOptions.workerSrc = path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
const STANDARD_FONTS_DIR = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + "/";

export type ParsedSource =
  | { kind: "text"; text: string }
  | { kind: "image"; base64: string; mediaType: "image/jpeg" | "image/png" };

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
    const buf = fs.readFileSync(filePath);
    const doc = await getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      isEvalSupported: false,
      standardFontDataUrl: STANDARD_FONTS_DIR,
    }).promise;
    let text = "";
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ") + "\n";
    }
    await doc.destroy();
    return { kind: "text", text: text.trim() };
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
