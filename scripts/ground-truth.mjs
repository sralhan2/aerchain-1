// Ground truth vendor pricing — used ONLY to fabricate the source documents
// and, later, to sanity-check extraction accuracy. The extraction pipeline
// never sees this file; it only ever sees the generated documents.

export const GROUND_TRUTH = {
  vendorA: {
    name: "NexTech Systems",
    currency: "INR",
    lines: {
      L01: 58500, L02: 93000, L03: 148000, L04: 9800, L05: 16900, L06: 39500,
      L07: 7350, L08: 1450, L09: 1850, L10: 2250, L11: 1650, L12: 690,
      L13: 6600, L14: 1850, L15: 470, L16: 1250, L17: 6950, L18: 2650,
      L19: 9900, L20: 5400, L21: 990, L22: 870, L23: 14900, L24: 11900,
      L25: 6000, L26: 480, L27: 25500, L28: 1400, L29: 990, L30: 680,
    },
  },
  vendorB: {
    name: "Meridian IT Supplies",
    currency: "INR",
    // L19/L20 (networking) and L27/L29 (NAS, security license) are outside
    // Meridian's hardware-reseller catalog — genuinely not stocked, not a
    // pricing failure.
    skipped: ["L03", "L06", "L17", "L19", "L20", "L27", "L29"],
    footnoteDiscountPct: 4, // applies to orders above ₹50L, stated in a footnote only — never applied to unit prices
    lines: {
      L01: 57200, L02: 91500, L04: 9400, L05: 16200,
      L07: 7100, L08: 1380, L09: 1790, L10: 2150, L11: 1550, L12: 640,
      L13: 6350, L14: 1720, L15: 440, L16: 1180, L18: 2500,
      L21: 920, L22: 810, L23: 14200, L24: 11200, L25: 5700, L26: 430,
      L28: 1300, L30: 620,
    },
  },
  vendorC: {
    name: "Apex Global Traders",
    currency: "USD",
    explicitLines: { L01: 690, L02: 1080, L04: 112, L05: 195 }, // USD, laptops+monitors quoted explicitly
    ambiguousNote: "rest same as last year", // L07-L18 minus L04/L05 — genuinely unresolvable, no historical data available
    // L19-L30 are new categories this cycle (networking, AV, power, NAS,
    // software license, accessories) — there IS no "last year" price for
    // them, so Apex can't even fall back to their usual dodge. Left
    // completely unquoted, distinct from the "same as last year" ambiguity.
    newCategoriesUnquoted: ["L19", "L20", "L21", "L22", "L23", "L24", "L25", "L26", "L27", "L28", "L29", "L30"],
    freightExtra: true,
  },
  vendorD: {
    name: "Prime Traders",
    currency: "INR",
    skipped: ["L03", "L06", "L13", "L14", "L17", "L19", "L20", "L23", "L24", "L25", "L27", "L29"],
    perBoxOf5: ["L12", "L15", "L16"], // quoted "per box of 5" instead of RFx's "per unit" — unit mismatch
    lines: {
      L01: 56800, L02: 90200, L04: 9200, L05: 15900,
      L07: 6950, L08: 1400, L09: 1700, L10: 2100, L11: 1500,
      L12: 3100, // per box of 5 -> 620/unit
      L15: 2050, // per box of 5 -> 410/unit
      L16: 5700, // per box of 5 -> 1140/unit
      L18: 2450,
      L21: 880, L22: 780, L26: 400, L28: 1250, L30: 590,
    },
  },
  vendorE: {
    name: "Horizon Digital Traders",
    currency: "INR",
    // Word doc, commercials written as flowing paragraphs rather than a
    // table — the brief's own example of an "ugly" response format.
    skipped: ["L03", "L06"], // "non-standard configs, quoted only on request"
    // Prices given as a range depending on order volume tier — genuinely
    // ambiguous, no single number to extract.
    rangeLines: {
      L01: { low: 56000, high: 58500 },
      L02: { low: 89500, high: 93500 },
    },
    // Dock + keyboard/mouse combo quoted as one bundled price — cannot be
    // disaggregated into L07 and L08 individually without guessing a split.
    bundle: { lines: ["L07", "L08"], price: 8700, label: "docking station and keyboard/mouse combo, bundled" },
    lines: {
      L04: 9700, L05: 16600, L09: 1820, L10: 2200, L11: 1600, L12: 670,
      L13: 6500, L14: 1800, L15: 460, L16: 1220, L17: 6800, L18: 2600,
      L19: 9800, L20: 5350, L21: 980, L22: 880, L23: 14800, L24: 11800,
      L25: 5950, L26: 470, L27: 25200, L28: 1400, L29: 980, L30: 670,
    },
  },
  fxRateUsedByApex: { usdToInr: 87.4, asOf: "2026-08-20" },
};
