import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getComparisonData } from "@/lib/comparison";
import { RFX } from "@/lib/rfx-data";
import { parseLinesParam } from "@/lib/line-selection";

export const maxDuration = 30;

function money(n: number) {
  return `Rs ${Math.round(n).toLocaleString("en-IN")}`;
}

// Renders the PDF into a Buffer. pdfkit is a pure-JS writer (no canvas / no
// native deps — unrelated to the DOMMatrix issue that hit the PDF *reader*
// in extraction), so this runs fine in a Node serverless function.
function renderPdf(payload: {
  prNumber: string;
  date: string;
  rows: { description: string; spec: string; qty: number; unit: string; vendorName: string; unitPrice: number; extended: number; resized: boolean }[];
  total: number;
  vendorTerms: { name: string; questionnaire: { question: string; answer: string }[] }[];
  excludedLines: string[];
  deselectedLines: string[];
  partialLines: string[];
  anyResized: boolean;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor("#000").text("Purchase Requisition", { align: "left" });
    doc.fontSize(9).fillColor("#555").text(`PR ${payload.prNumber}  ·  Generated ${payload.date}`);
    doc.moveDown(1);

    doc.fontSize(10).fillColor("#000");
    doc.text(`Buyer: ${RFX.buyerOrg}`);
    doc.text(`Reference RFx: ${RFX.title}`);
    doc.text(`Delivery location: ${RFX.deliveryLocation}`);
    doc.text(`Delivery window: ${RFX.deliveryWindow}`);
    doc.moveDown(1);

    doc.fontSize(12).text("Awarded line items", { underline: true });
    doc.moveDown(0.4);

    const colDesc = 50;
    const colVendor = 250;
    const colQty = 350;
    const colPrice = 390;
    const colExt = 470;
    const rowGap = 6;

    doc.fontSize(8.5).fillColor("#555");
    doc.text("Item", colDesc, doc.y, { width: 195, continued: false });
    doc.text("Vendor", colVendor, doc.y - doc.currentLineHeight(), { width: 95 });
    doc.text("Qty", colQty, doc.y - doc.currentLineHeight(), { width: 35 });
    doc.text("Unit price", colPrice, doc.y - doc.currentLineHeight(), { width: 75, align: "right" });
    doc.text("Extended", colExt, doc.y - doc.currentLineHeight(), { width: 75, align: "right" });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.3);

    for (const row of payload.rows) {
      if (doc.y > 700) {
        doc.addPage();
      }
      const rowY = doc.y;
      doc.fontSize(9).fillColor("#111");
      const descText = `${row.description}${row.spec ? ` — ${row.spec}` : ""}`;
      const descHeight = doc.heightOfString(descText, { width: 195 });
      doc.text(descText, colDesc, rowY, { width: 195 });
      doc.text(row.vendorName, colVendor, rowY, { width: 95 });
      doc.text(`${row.qty} ${row.unit}${row.resized ? "*" : ""}`, colQty, rowY, { width: 35 });
      doc.text(money(row.unitPrice), colPrice, rowY, { width: 75, align: "right" });
      doc.text(money(row.extended), colExt, rowY, { width: 75, align: "right" });
      doc.y = rowY + Math.max(descHeight, doc.currentLineHeight()) + rowGap;
    }

    doc.moveDown(0.5);
    doc.moveTo(350, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor("#000").text(`Total: ${money(payload.total)}`, colPrice - 30, doc.y, { width: 225, align: "right" });
    doc.moveDown(0.6);

    if (payload.anyResized) {
      doc.fontSize(8).fillColor("#a15c00").text(
        "* Quantity adjusted from the original RFx on the comparison screen before award. Priced at the vendor's quoted unit rate — " +
          "not a re-quote at this volume. Confirm pricing with the vendor before issuing a PO at a materially different quantity.",
        50,
        doc.y,
        { width: 495 }
      );
      doc.moveDown(0.8);
    }
    doc.moveDown(0.4);

    if (payload.excludedLines.length > 0) {
      doc.fontSize(9).fillColor("#a15c00");
      doc.text(
        `Not included in this PR (no vendor quoted these lines): ${payload.excludedLines.join(", ")}`,
        50,
        doc.y,
        { width: 495 }
      );
      doc.moveDown(0.6);
    }

    if (payload.deselectedLines.length > 0) {
      doc.fontSize(9).fillColor("#666");
      doc.text(
        `Not included in this PR (deselected by the buyer): ${payload.deselectedLines.join(", ")}`,
        50,
        doc.y,
        { width: 495 }
      );
      doc.moveDown(0.6);
    }

    if (payload.partialLines.length > 0) {
      doc.fontSize(9).fillColor("#a15c00");
      doc.text(
        `Partially allocated (awarded quantity is less than the full line quantity): ${payload.partialLines.join(", ")}`,
        50,
        doc.y,
        { width: 495 }
      );
      doc.moveDown(1);
    }

    // doc.x carries over from the right-aligned "Total:" line above (pdfkit's
    // text() only moves the cursor to where the CALLER put it, not back to
    // the margin) — every text() call below must pass x=50 explicitly, or
    // this section silently starts partway across the page and clips off
    // the right edge on any PR short enough not to have already crossed a
    // page break (which happened to reset x back to the margin by luck).
    doc.fontSize(12).fillColor("#000").text("Awarded vendor terms", 50, doc.y, { underline: true, width: 495 });
    doc.moveDown(0.4);
    for (const v of payload.vendorTerms) {
      if (doc.y > 680) doc.addPage();
      doc.fontSize(10).fillColor("#000").text(v.name, 50, doc.y, { width: 495 });
      doc.fontSize(8.5).fillColor("#333");
      for (const qa of v.questionnaire) {
        doc.text(`• ${qa.question} — ${qa.answer}`, 50, doc.y, { width: 495 });
      }
      doc.moveDown(0.6);
    }

    doc.moveDown(0.8);
    doc.fontSize(7.5).fillColor("#888").text(
      "Generated by RFx Copilot from live-extracted vendor quotes. Prices are normalized to INR at the reference FX rate on file; verify before issuing a purchase order.",
      50,
      doc.y,
      { width: 495 }
    );

    doc.end();
  });
}

type Allocation = { vendorId: string; qty: number };

export async function POST(req: Request) {
  try {
    const { awarded, lines, qtyOverrides: whatIfQtyOverrides } = (await req.json()) as {
      awarded: Record<string, Allocation[]>;
      lines: unknown;
      qtyOverrides: unknown;
    };
    if (!awarded || typeof awarded !== "object") {
      return NextResponse.json({ error: "Missing awarded vendor selections" }, { status: 400 });
    }
    const { ids: selectedLineIds, qtyOverrides: draftQtyOverrides } = parseLinesParam(typeof lines === "string" ? lines : null);
    // Two independent sources of a quantity override, merged with the more
    // recent buyer intent winning: draftQtyOverrides came from matching the
    // buyer's original RFx draft to the catalog; whatIfQtyOverrides is a
    // what-if resize made right here on the comparison screen, after seeing
    // prices. A line the buyer just resized should reflect that, not the
    // value from further back in the flow.
    const qtyOverrides: Record<string, number> = { ...draftQtyOverrides, ...(whatIfQtyOverrides && typeof whatIfQtyOverrides === "object" ? whatIfQtyOverrides : {}) };
    const resizedLineIds = new Set(
      Object.keys(whatIfQtyOverrides && typeof whatIfQtyOverrides === "object" ? whatIfQtyOverrides : {})
    );
    const { rfxLines, vendors, grid } = await getComparisonData(selectedLineIds, qtyOverrides);

    const rows: { description: string; spec: string; qty: number; unit: string; vendorName: string; unitPrice: number; extended: number; resized: boolean }[] = [];
    const excludedLines: string[] = [];
    const deselectedLines: string[] = [];
    const partialLines: string[] = [];
    const awardedVendorIds = new Set<string>();
    let total = 0;
    let anyResized = false;

    for (const line of rfxLines) {
      const effectiveQty = qtyOverrides[line.id] ?? line.qty;
      const allocations = Array.isArray(awarded[line.id]) ? awarded[line.id] : [];

      // A line with no vendor quote at all vs. a line the buyer deliberately
      // zeroed out are different facts worth saying differently on the PR —
      // the first is a gap in the vendor pool, the second is a decision.
      const hasAnyQuote = vendors.some((v) => grid[line.id]?.[v.id]?.status === "quoted");
      if (allocations.length === 0) {
        if (hasAnyQuote) deselectedLines.push(line.description);
        else excludedLines.push(line.description);
        continue;
      }

      const resized = resizedLineIds.has(line.id);
      if (resized) anyResized = true;

      let allocatedQty = 0;
      let lineHadValidAllocation = false;
      for (const alloc of allocations) {
        const vendor = alloc?.vendorId ? vendors.find((v) => v.id === alloc.vendorId) : null;
        const cell = alloc?.vendorId ? grid[line.id]?.[alloc.vendorId] : null;
        if (!vendor || !cell || cell.status !== "quoted" || cell.normalizedPriceInr === null || !alloc.qty || alloc.qty <= 0) {
          continue;
        }
        lineHadValidAllocation = true;
        allocatedQty += alloc.qty;
        const extended = cell.normalizedPriceInr * alloc.qty;
        total += extended;
        awardedVendorIds.add(vendor.id);
        rows.push({
          description: line.description,
          spec: line.spec,
          qty: alloc.qty,
          unit: line.unit,
          vendorName: vendor.name,
          unitPrice: cell.normalizedPriceInr,
          extended,
          resized,
        });
      }

      if (!lineHadValidAllocation) {
        if (hasAnyQuote) deselectedLines.push(line.description);
        else excludedLines.push(line.description);
        continue;
      }

      if (allocatedQty !== effectiveQty) {
        partialLines.push(`${line.description} (${allocatedQty}/${effectiveQty} ${line.unit})`);
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No awarded lines have a valid quoted price to include." }, { status: 400 });
    }

    const vendorTerms = vendors
      .filter((v) => awardedVendorIds.has(v.id))
      .map((v) => ({ name: v.name, questionnaire: v.questionnaire }));

    const prNumber = `PR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
    const date = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });

    const pdfBuffer = await renderPdf({ prNumber, date, rows, total, vendorTerms, excludedLines, deselectedLines, partialLines, anyResized });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${prNumber}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("generate-pr failed:", err);
    return NextResponse.json({ error: err?.message ?? "Couldn't generate the PR." }, { status: 500 });
  }
}
