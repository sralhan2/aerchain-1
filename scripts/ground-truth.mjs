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
    },
  },
  vendorB: {
    name: "Meridian IT Supplies",
    currency: "INR",
    skipped: ["L03", "L06", "L17"],
    footnoteDiscountPct: 4, // applies to orders above ₹50L, stated in a footnote only — never applied to unit prices
    lines: {
      L01: 57200, L02: 91500, L04: 9400, L05: 16200,
      L07: 7100, L08: 1380, L09: 1790, L10: 2150, L11: 1550, L12: 640,
      L13: 6350, L14: 1720, L15: 440, L16: 1180, L18: 2500,
    },
  },
  vendorC: {
    name: "Apex Global Traders",
    currency: "USD",
    explicitLines: { L01: 690, L02: 1080, L04: 112, L05: 195 }, // USD, laptops+monitors quoted explicitly
    ambiguousNote: "rest same as last year", // L07-L18 minus L04/L05 — genuinely unresolvable, no historical data available
    freightExtra: true,
  },
  vendorD: {
    name: "Prime Traders",
    currency: "INR",
    skipped: ["L03", "L06", "L13", "L14", "L17"],
    perBoxOf5: ["L12", "L15", "L16"], // quoted "per box of 5" instead of RFx's "per unit" — unit mismatch
    lines: {
      L01: 56800, L02: 90200, L04: 9200, L05: 15900,
      L07: 6950, L08: 1400, L09: 1700, L10: 2100, L11: 1500,
      L12: 3100, // per box of 5 -> 620/unit
      L15: 2050, // per box of 5 -> 410/unit
      L16: 5700, // per box of 5 -> 1140/unit
      L18: 2450,
    },
  },
  fxRateUsedByApex: { usdToInr: 87.4, asOf: "2026-08-20" },
};
