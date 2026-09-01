// Deterministic normalization — NOT an LLM call. The extraction loop reads and
// flags; this step reconciles currency and unit basis using rules the buyer
// can see and audit. Keeping this out of the LLM is deliberate: math should be
// computed, not narrated.

export const FX_RATE = { usdToInr: 87.4, asOf: "2026-08-20", source: "Buyer-configured reference rate (manual entry, stubbed for demo)" };

export function normalizeUnitPrice(unit_price: number | null, currency: string | null, basis: string): { value: number | null; note: string | null } {
  if (unit_price === null) return { value: null, note: null };

  let value = unit_price;
  let note: string | null = null;

  if (currency && currency.toUpperCase() === "USD") {
    value = value * FX_RATE.usdToInr;
    note = `Converted from USD at ${FX_RATE.usdToInr} (${FX_RATE.asOf})`;
  }

  if (basis === "per_box_of_5") {
    value = value / 5;
    note = (note ? note + "; " : "") + "Converted from per-box-of-5 to per-unit";
  }

  if (basis === "other" || basis === "unknown") {
    return { value: null, note: "Basis unclear — not normalized, needs buyer review" };
  }

  return { value: Math.round(value * 100) / 100, note };
}
