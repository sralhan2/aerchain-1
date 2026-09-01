// Shared encode/decode for the `lines` URL param that threads the buyer's
// matched draft lines (and, where unambiguous, their actual requested
// quantities) through /inbox -> /comparison -> /api/generate-pr ->
// /api/analyst. Format: comma-separated `id` or `id:qty` entries, e.g.
// "L01:20,L08:20,L11:20" — qty is only present when a single catalog line
// matched a single draft line, so we know unambiguously which quantity the
// buyer actually asked for (vs. e.g. a generic "laptops" draft line matching
// three catalog variants, where we can't tell how to split the quantity).
export function parseLinesParam(param: string | null | undefined): { ids: string[] | null; qtyOverrides: Record<string, number> } {
  if (!param) return { ids: null, qtyOverrides: {} };
  const ids: string[] = [];
  const qtyOverrides: Record<string, number> = {};
  for (const entry of param.split(",")) {
    if (!entry) continue;
    const [id, qtyStr] = entry.split(":");
    if (!id) continue;
    ids.push(id);
    if (qtyStr) {
      const qty = Number(qtyStr);
      if (Number.isFinite(qty) && qty > 0) qtyOverrides[id] = qty;
    }
  }
  return { ids: ids.length ? ids : null, qtyOverrides };
}

export function serializeLinesParam(ids: string[], qtyOverrides: Record<string, number>): string {
  return ids.map((id) => (qtyOverrides[id] ? `${id}:${qtyOverrides[id]}` : id)).join(",");
}
