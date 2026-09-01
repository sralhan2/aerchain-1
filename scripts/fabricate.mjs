import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { GROUND_TRUTH } from "./ground-truth.mjs";

const RFX = JSON.parse(fs.readFileSync(path.resolve("src/lib/rfx-data.json"), "utf-8"));

const OUT = path.resolve("data/vendor-docs");
fs.mkdirSync(OUT, { recursive: true });

const lineById = Object.fromEntries(RFX.lines.map((l) => [l.id, l]));

// ---------- Vendor A: NexTech Systems — Excel, deliberately off-template ----------
async function vendorAExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Quote");
  ws.addRow(["NexTech Systems Pvt. Ltd. — Commercial Quotation"]);
  ws.addRow(["Quote Ref: NXT/QT/2026/0847", "Date: 22-Aug-2026", "Validity: 15 days"]);
  ws.addRow([]);
  // Off-template: their own column order, their own SKU codes, no RFx line IDs.
  ws.addRow(["S.No", "Item Name", "Brand / Model Ref", "Unit Rate (INR, excl. GST)", "Available Qty", "Remarks"]);
  const items = [
    ["Business Ultrabook 14-inch, i5-1340P/16GB/512GB", "NX-UB14-I5", GROUND_TRUTH.vendorA.lines.L01, 120, ""],
    ["Business Ultrabook 14-inch Premium, i7-1360P/32GB/1TB", "NX-UB14-I7P", GROUND_TRUTH.vendorA.lines.L02, 40, "Backlit keyboard incl."],
    ["Rugged Field Laptop, MIL-STD-810H, i5/16GB/512GB", "NX-RG14", GROUND_TRUTH.vendorA.lines.L03, 15, ""],
    ["24\" FHD Monitor, IPS, HDMI+DP, adjustable stand", "NX-MN24", GROUND_TRUTH.vendorA.lines.L04, 150, ""],
    ["27\" QHD Monitor, IPS, USB-C 65W PD", "NX-MN27", GROUND_TRUTH.vendorA.lines.L05, 60, ""],
    ["34\" Ultrawide Curved Monitor, USB-C PD", "NX-MN34UW", GROUND_TRUTH.vendorA.lines.L06, 10, ""],
    ["USB-C Dual 4K Docking Station, 100W PD, GbE", "NX-DK100", GROUND_TRUTH.vendorA.lines.L07, 130, ""],
    ["Wireless Keyboard + Mouse Set", "NX-KM24", GROUND_TRUTH.vendorA.lines.L08, 160, "per set"],
    ["USB Headset with Noise-Cancelling Mic", "NX-HS10", GROUND_TRUTH.vendorA.lines.L09, 160, ""],
    ["1080p Autofocus Webcam w/ Privacy Shutter", "NX-WC10", GROUND_TRUTH.vendorA.lines.L10, 100, ""],
    ["15.6\" Water-Resistant Laptop Backpack", "NX-BP15", GROUND_TRUTH.vendorA.lines.L11, 175, ""],
    ["USB-C to HDMI Adapter, 4K@30Hz", "NX-AD01", GROUND_TRUTH.vendorA.lines.L12, 175, ""],
    ["Extended Warranty — Laptops, +2yr on-site", "NX-EW-LP2", GROUND_TRUTH.vendorA.lines.L13, 175, "OEM-backed"],
    ["Extended Warranty — Monitors, +2yr on-site", "NX-EW-MN2", GROUND_TRUTH.vendorA.lines.L14, 220, "OEM-backed"],
    ["USB-C Charging Cable 1.5m, 100W braided", "NX-CB15", GROUND_TRUTH.vendorA.lines.L15, 175, ""],
    ["14\" Laptop Privacy Filter", "NX-PF14", GROUND_TRUTH.vendorA.lines.L16, 175, ""],
    ["1TB Portable SSD, USB 3.2", "NX-SSD1TB", GROUND_TRUTH.vendorA.lines.L17, 30, ""],
    ["7-in-1 USB-C Hub, HDMI/USB-A x3/SD/PD", "NX-HUB7", GROUND_TRUTH.vendorA.lines.L18, 50, ""],
    ["24-Port Gigabit Switch, rack-mountable", "NX-SW24", GROUND_TRUTH.vendorA.lines.L19, 8, ""],
    ["Wireless Access Point, Wi-Fi 6, PoE", "NX-AP6", GROUND_TRUTH.vendorA.lines.L20, 25, ""],
    ["Adjustable Aluminium Laptop Stand", "NX-STAND16", GROUND_TRUTH.vendorA.lines.L21, 175, ""],
    ["Wireless Presenter Clicker w/ Laser", "NX-CLICK1", GROUND_TRUTH.vendorA.lines.L22, 40, ""],
    ["Conference Speakerphone, 6-mic, USB/BT", "NX-SPK6", GROUND_TRUTH.vendorA.lines.L23, 15, ""],
    ["4K Conference Camera, auto-framing", "NX-CAM4K", GROUND_TRUTH.vendorA.lines.L24, 15, ""],
    ["Desk-side UPS, 1kVA/600W", "NX-UPS1K", GROUND_TRUTH.vendorA.lines.L25, 30, ""],
    ["6-Socket Surge Protector, 15A", "NX-SURGE6", GROUND_TRUTH.vendorA.lines.L26, 175, ""],
    ["4-Bay NAS, diskless, GbE", "NX-NAS4B", GROUND_TRUTH.vendorA.lines.L27, 5, ""],
    ["Ergonomic Vertical Mouse, wireless", "NX-MSEV1", GROUND_TRUTH.vendorA.lines.L28, 60, ""],
    ["Endpoint Security License, 1yr/seat", "NX-SEC1Y", GROUND_TRUTH.vendorA.lines.L29, 300, "centrally managed"],
    ["Laptop Cable Lock, keyed", "NX-LOCK1", GROUND_TRUTH.vendorA.lines.L30, 175, ""],
  ];
  items.forEach((row, i) => ws.addRow([i + 1, ...row]));
  ws.addRow([]);
  ws.addRow(["Payment terms: 30% advance, 70% on delivery. Freight: included within Bengaluru city limits."]);

  const qs = wb.addWorksheet("Vendor Info");
  qs.addRow(["Average delivery lead time from PO (in-stock items)", "10-12 working days"]);
  qs.addRow(["Standard warranty on laptops", "1 year onsite (manufacturer)"]);
  qs.addRow(["On-site break-fix support in Bengaluru", "Yes — NBD (Next Business Day) SLA"]);
  qs.addRow(["Reference 1", "Cognizant Technology Solutions — 450 unit refresh, Jan 2026"]);
  qs.addRow(["Reference 2", "Aditya Birla Capital — 210 unit refresh, Nov 2025"]);
  qs.addRow(["Partial shipment / invoicing accepted", "Yes, category-wise"]);

  await wb.xlsx.writeFile(path.join(OUT, "vendor-a-nextech-quote.xlsx"));
  console.log("Vendor A (Excel) written");
}

// ---------- Vendor B: Meridian IT Supplies — PDF, discount buried in footnote, 3 lines skipped ----------
function vendorBPdf() {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(path.join(OUT, "vendor-b-meridian-quote.pdf")));

  doc.fontSize(18).text("MERIDIAN IT SUPPLIES", { align: "left" });
  doc.fontSize(9).fillColor("#555").text("No. 22, Residency Road, Bengaluru 560025  |  GSTIN 29AAFCM1234K1Z5", { align: "left" });
  doc.moveDown(1.2);
  doc.fillColor("#000").fontSize(13).text("Commercial Quotation — Ref MIS/2026/2291", { underline: false });
  doc.fontSize(10).text("Date: 21-Aug-2026    Validity: 10 days    In response to your RFx: IT Hardware Refresh FY27 Q1");
  doc.moveDown(0.8);

  doc.fontSize(11).text("Vendor Information", { underline: true });
  doc.fontSize(10).list([
    "Delivery lead time: 14 working days from PO for in-stock lines",
    "Standard laptop warranty: 1 year onsite",
    "On-site break-fix in Bengaluru: Yes, 48-hour SLA",
    "References: Wipro Enterprises (180 units, Mar 2026); Titan Company (95 units, Jun 2026)",
    "Partial shipment: Yes",
  ]);
  doc.moveDown(0.6);

  doc.fontSize(11).text("Pricing (INR, excl. GST)", { underline: true });
  doc.moveDown(0.4);

  const rows = [
    ["Business Ultrabook 14\" (i5/16GB/512GB)", GROUND_TRUTH.vendorB.lines.L01],
    ["Business Ultrabook 14\" Premium (i7/32GB/1TB)", GROUND_TRUTH.vendorB.lines.L02],
    ["24\" FHD Monitor", GROUND_TRUTH.vendorB.lines.L04],
    ["27\" QHD Monitor", GROUND_TRUTH.vendorB.lines.L05],
    ["USB-C Dual Monitor Docking Station, 100W", GROUND_TRUTH.vendorB.lines.L07],
    ["Wireless Keyboard + Mouse Combo", GROUND_TRUTH.vendorB.lines.L08],
    ["USB Wired Headset, NC mic", GROUND_TRUTH.vendorB.lines.L09],
    ["1080p Webcam w/ privacy shutter", GROUND_TRUTH.vendorB.lines.L10],
    ["Laptop Backpack 15.6\"", GROUND_TRUTH.vendorB.lines.L11],
    ["USB-C to HDMI Adapter", GROUND_TRUTH.vendorB.lines.L12],
    ["Extended Warranty — Laptop, +2yr", GROUND_TRUTH.vendorB.lines.L13],
    ["Extended Warranty — Monitor, +2yr", GROUND_TRUTH.vendorB.lines.L14],
    ["USB-C Charging Cable 1.5m", GROUND_TRUTH.vendorB.lines.L15],
    ["Laptop Privacy Screen Filter", GROUND_TRUTH.vendorB.lines.L16],
    ["USB-C 7-in-1 Hub", GROUND_TRUTH.vendorB.lines.L18],
    ["Adjustable Laptop Stand", GROUND_TRUTH.vendorB.lines.L21],
    ["Wireless Presenter Clicker", GROUND_TRUTH.vendorB.lines.L22],
    ["Conference Room Speakerphone", GROUND_TRUTH.vendorB.lines.L23],
    ["4K Conference Room Camera", GROUND_TRUTH.vendorB.lines.L24],
    ["Desk-side UPS, 1kVA", GROUND_TRUTH.vendorB.lines.L25],
    ["6-Socket Surge Protector", GROUND_TRUTH.vendorB.lines.L26],
    ["Ergonomic Vertical Mouse", GROUND_TRUTH.vendorB.lines.L28],
    ["Laptop Cable Lock", GROUND_TRUTH.vendorB.lines.L30],
  ];

  const colItemX = 50;
  const colPriceX = 400;
  const colWidth = 340;
  const rowGap = 4;

  doc.fontSize(9.5).fillColor("#000");
  doc.text("Item", colItemX, doc.y, { continued: false, width: colWidth });
  doc.text("Unit Price", colPriceX, doc.y - doc.currentLineHeight(), { width: 130, align: "right" });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.3);

  rows.forEach(([item, price]) => {
    const rowY = doc.y;
    const priceStr = `Rs ${price.toLocaleString("en-IN")}`;
    doc.fontSize(9.5).fillColor("#111");
    const itemHeight = doc.heightOfString(item, { width: colWidth });
    doc.text(item, colItemX, rowY, { width: colWidth });
    doc.text(priceStr, colPriceX, rowY, { width: 130, align: "right" });
    doc.y = rowY + itemHeight + rowGap;
  });

  doc.moveDown(1);
  doc.fontSize(9).fillColor("#000").text(
    "Note: Rugged laptops, 34\" ultrawide monitors, external SSDs, networking gear (switches/APs), NAS units, and " +
      "software licenses are not part of our current catalog and are not quoted above.",
    { width: 500 }
  );
  doc.moveDown(1.5);
  doc.fontSize(7.5).fillColor("#666").text(
    `* A ${GROUND_TRUTH.vendorB.footnoteDiscountPct}% volume discount applies to the total order value on orders exceeding Rs 50,00,000, applied at invoicing. Not reflected in unit prices above. Freight extra, billed at actuals.`,
    { width: 500 }
  );

  doc.end();
  console.log("Vendor B (PDF) written");
}

// ---------- Vendor C: Apex Global Traders — terse email, USD, "same as last year" ----------
function vendorCEmail() {
  const gt = GROUND_TRUTH.vendorC;
  const body = `From: sales@apexglobaltraders.com
To: procurement@meridianfs.example.com
Subject: Re: RFx - IT Hardware Refresh FY27 Q1

Hi,

Thanks for sending this over. Quick reply, been slammed this week.

Laptops: standard config $${gt.explicitLines.L01}/unit, premium config $${gt.explicitLines.L02}/unit.
Monitors: 24" $${gt.explicitLines.L04}/unit, 27" $${gt.explicitLines.L05}/unit. Don't carry the 34" ultrawide.

Everything else that was on last year's list (docks, keyboards, headsets, webcams, bags, adapters,
cables, privacy filters, hub, warranties) — same as last year, we haven't changed those rates. You
have the old sheet.

The networking gear, conference room stuff, UPS, surge protectors, NAS, security licenses and
cable locks are all new asks this cycle - we don't have a rate for any of that, would need to
source and get back to you separately.

Freight extra, will quote separately once order is confirmed. Prices in USD, ex-works.

On your questionnaire - lead time is about 3 weeks for the laptops/monitors above since they're
imported, we do offer on-site support via a local partner (Bangalore), 1yr standard warranty on
laptops, can share references if this moves forward, and yes we can do partial shipments.

Let us know if you want to proceed.

Rajiv
Apex Global Traders
`;
  fs.writeFileSync(path.join(OUT, "vendor-c-apex-email.txt"), body);
  console.log("Vendor C (email) written");
}

// ---------- Vendor D: Prime Traders — angled photo of a printed rate card ----------
async function vendorDPhoto() {
  const gt = GROUND_TRUTH.vendorD;
  const rows = [
    ["Ultrabook 14in i5/16/512", gt.lines.L01],
    ["Ultrabook 14in i7/32/1TB", gt.lines.L02],
    ["Monitor 24in FHD", gt.lines.L04],
    ["Monitor 27in QHD", gt.lines.L05],
    ["Docking Stn USB-C 100W", gt.lines.L07],
    ["Kb+Mouse Combo Wireless", gt.lines.L08],
    ["Headset USB NC", gt.lines.L09],
    ["Webcam 1080p", gt.lines.L10],
    ["Backpack 15.6in", gt.lines.L11],
    ["HDMI Adapter USB-C (BOX/5)", gt.lines.L12],
    ["Charging Cable 1.5m (BOX/5)", gt.lines.L15],
    ["Privacy Filter 14in (BOX/5)", gt.lines.L16],
    ["USB-C Hub 7in1", gt.lines.L18],
    ["Laptop Stand Adjustable", gt.lines.L21],
    ["Presenter Clicker Wireless", gt.lines.L22],
    ["Surge Protector 6-Skt", gt.lines.L26],
    ["Mouse Vertical Wireless", gt.lines.L28],
    ["Cable Lock Keyed", gt.lines.L30],
  ];

  const headerY = 128;
  const rowH = 34;
  const firstRowY = 160;
  const width = 900;
  const height = firstRowY + rows.length * rowH + 90;

  const headerSvg = `<text x="40" y="${headerY}" font-family="Courier New, monospace" font-size="15" font-weight="700" fill="#333" letter-spacing="1">ITEM</text>
      <text x="720" y="${headerY}" font-family="Courier New, monospace" font-size="15" font-weight="700" fill="#333" text-anchor="end" letter-spacing="1">RATE (Rs)</text>`;

  const rowsSvg = rows
    .map((r, i) => {
      const y = firstRowY + i * rowH;
      return `<text x="40" y="${y}" font-family="Courier New, monospace" font-size="19" font-weight="400" fill="#111">${r[0]}</text>
              <text x="720" y="${y}" font-family="Courier New, monospace" font-size="19" font-weight="400" fill="#111" text-anchor="end">${typeof r[1] === "number" ? r[1].toLocaleString("en-IN") : r[1]}</text>`;
    })
    .join("\n");

  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f2efe6"/>
    <g transform="rotate(-1.2 ${width / 2} ${height / 2})">
      <rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="#fffdf7" stroke="#ccc" stroke-width="1"/>
      <text x="40" y="65" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#1a1a1a">PRIME TRADERS</text>
      <text x="40" y="90" font-family="Courier New, monospace" font-size="14" fill="#555">Rate Card — IT Hardware — Effective 18-Aug-2026 (Rs, per unit unless noted)</text>
      <line x1="40" y1="102" x2="${width - 40}" y2="102" stroke="#999" stroke-width="1"/>
      ${headerSvg}
      <line x1="40" y1="${headerY + 12}" x2="${width - 40}" y2="${headerY + 12}" stroke="#999" stroke-width="1"/>
      ${rowsSvg}
      <line x1="40" y1="${firstRowY + rows.length * rowH - 10}" x2="${width - 40}" y2="${firstRowY + rows.length * rowH - 10}" stroke="#999" stroke-width="1"/>
      <text x="40" y="${firstRowY + rows.length * rowH + 22}" font-family="Courier New, monospace" font-size="14" fill="#333">Prices ex-GST. Items marked BOX/5 sold in packs of 5 only, rate is per box.</text>
      <text x="40" y="${firstRowY + rows.length * rowH + 44}" font-family="Courier New, monospace" font-size="14" fill="#333">Rugged laptops, ultrawide monitors, ext. warranties, SSDs, networking, AV, UPS, NAS, licenses — not stocked.</text>
      <text x="40" y="${firstRowY + rows.length * rowH + 66}" font-family="Courier New, monospace" font-size="13" fill="#777">Contact: 98xxx-xxxxx | Whitefield, Bengaluru</text>
    </g>
  </svg>`;

  await sharp(Buffer.from(svg))
    .resize(1400)
    .modulate({ brightness: 0.97 })
    .jpeg({ quality: 82 })
    .toFile(path.join(OUT, "vendor-d-prime-ratecard.jpg"));
  console.log("Vendor D (photo) written");

  fs.writeFileSync(
    path.join(OUT, "vendor-d-questionnaire.txt"),
    `Prime Traders — Vendor Questionnaire Response

Delivery lead time: 7-9 days (local stock)
Standard laptop warranty: 1 year, carry-in only (no on-site)
On-site break-fix in Bengaluru: No — carry-in service center only, Whitefield
References: Sarala Foods Pvt Ltd (60 units, Feb 2026); a school chain in Bengaluru (35 units, 2025 - name withheld by client)
Partial shipment: Yes, no restriction
`
  );
  console.log("Vendor D (questionnaire) written");
}

// ---------- Vendor E: Horizon Digital Traders — Word doc, commercials in prose paragraphs ----------
async function vendorEWord() {
  const gt = GROUND_TRUTH.vendorE;
  const money = (n) => `Rs ${n.toLocaleString("en-IN")}`;

  const explicitOrder = [
    "L04", "L05", "L09", "L10", "L11", "L12", "L13", "L14", "L15", "L16", "L17", "L18",
    "L19", "L20", "L21", "L22", "L23", "L24", "L25", "L26", "L27", "L28", "L29", "L30",
  ];
  const nameFor = (id) => lineById[id]?.description ?? id;
  const explicitSentence =
    explicitOrder.map((id) => `${nameFor(id)} at ${money(gt.lines[id])} per unit`).join(", ") + ".";

  const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 200 } });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Horizon Digital Traders", heading: HeadingLevel.HEADING_1 }),
          p("Commercial quotation in response to your RFx \"IT Hardware Refresh — FY27 Q1\", dated 25-Aug-2026. Validity: 14 days from date of this letter.", { italics: true }),
          new Paragraph({ text: "Pricing", heading: HeadingLevel.HEADING_2 }),
          p(
            `We're pleased to quote for this refresh. On the laptops: pricing depends on the final order volume we settle on, so for the standard ` +
              `Business Ultrabook 14" we're looking at somewhere between ${money(gt.rangeLines.L01.low)} and ${money(gt.rangeLines.L01.high)} per unit, and for the ` +
              `Premium Business Ultrabook 14" between ${money(gt.rangeLines.L02.low)} and ${money(gt.rangeLines.L02.high)} per unit — happy to firm this up once we know ` +
              `the committed quantity.`
          ),
          p(
            `The docking station and keyboard/mouse combo we've priced together as a bundle rather than separately, since most of our customers take them ` +
              `together — that bundle works out to ${money(gt.bundle.price)} per set (one dock, one keyboard/mouse combo).`
          ),
          p(`For the remaining items on your list, our rates per unit are as follows: ${explicitSentence}`),
          p(
            `We don't currently carry the Rugged Field Laptop or the 34" Ultrawide Monitor — these are non-standard configurations for us and we'd only be able ` +
              `to quote them on request after checking with our supplier, so we haven't included a number for either.`
          ),
          p("All prices above are ex-GST, ex-works our Bengaluru warehouse. Freight will be billed at actuals."),
          new Paragraph({ text: "Vendor Questionnaire", heading: HeadingLevel.HEADING_2 }),
          p(
            "On delivery lead time — for anything we hold in stock, you're looking at roughly 12 working days from PO. Our standard laptop warranty is " +
              "1 year, onsite, through our manufacturer tie-up. We do provide on-site break-fix support within Bengaluru, with a 72-hour SLA. Two references " +
              "for comparable orders in the last year: Manipal Technologies (140 units, Apr 2026) and a mid-sized BPO in Electronic City (90 units, name " +
              "withheld pending their approval). And yes, we're fine with partial shipment and partial invoicing, billed category-wise."
          ),
          p("Please let us know if you'd like to proceed or need the volume-tier pricing firmed up.", { italics: true }),
          p("Regards,\nSales Desk, Horizon Digital Traders", { italics: true }),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT, "vendor-e-horizon-quote.docx"), buf);
  console.log("Vendor E (Word doc) written");
}

await vendorAExcel();
vendorBPdf();
vendorCEmail();
await vendorDPhoto();
await vendorEWord();
console.log("\nAll vendor documents fabricated in data/vendor-docs/");
