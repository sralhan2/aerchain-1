import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
// Import the lib file directly, not the package root — the root index.js runs
// a debug snippet on import (reads a test fixture) whenever module.parent is
// unset, which is the case under Next.js's bundler and breaks the route.
// @ts-ignore - no bundled types
import pdfParse from "pdf-parse/lib/pdf-parse.js";

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
    const data = await pdfParse(buf);
    return { kind: "text", text: data.text.trim() };
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
