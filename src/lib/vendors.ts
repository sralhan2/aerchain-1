export const VENDOR_META = [
  {
    id: "vendorA",
    name: "NexTech Systems",
    format: "excel",
    formatLabel: "Excel · off-template",
    file: "vendor-a-nextech-quote.xlsx",
    receivedAt: "22-Aug-2026, 6:41 PM",
  },
  {
    id: "vendorB",
    name: "Meridian IT Supplies",
    format: "pdf",
    formatLabel: "PDF quote",
    file: "vendor-b-meridian-quote.pdf",
    receivedAt: "21-Aug-2026, 11:02 AM",
  },
  {
    id: "vendorC",
    name: "Apex Global Traders",
    format: "email",
    formatLabel: "Plain-text email",
    file: "vendor-c-apex-email.txt",
    receivedAt: "24-Aug-2026, 9:15 AM",
  },
  {
    id: "vendorD",
    name: "Prime Traders",
    format: "photo",
    formatLabel: "Photo of a rate card",
    file: "vendor-d-prime-ratecard.jpg",
    // Sent as a follow-up alongside the photo — the questionnaire answers
    // live here, not on the rate card itself.
    extraFiles: ["vendor-d-questionnaire.txt"],
    receivedAt: "23-Aug-2026, 4:27 PM",
  },
  {
    id: "vendorE",
    name: "Horizon Digital Traders",
    format: "docx",
    formatLabel: "Word doc · prose quote",
    file: "vendor-e-horizon-quote.docx",
    receivedAt: "25-Aug-2026, 3:52 PM",
  },
] as const;
