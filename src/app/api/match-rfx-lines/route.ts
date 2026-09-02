import { NextResponse } from "next/server";
import { matchDraftToCatalog } from "@/lib/rfx-matcher";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { lines } = await req.json();
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "No draft lines provided" }, { status: 400 });
    }
    const matches = await matchDraftToCatalog(lines);
    const rfxLineIds = Array.from(new Set(matches.flatMap((m) => m.matched_catalog_ids)));

    // A draft line maps to exactly one catalog line most of the time, and
    // the buyer's stated quantity applies to it directly. When it's
    // ambiguous — a generic "laptops" spanning the standard + premium SKUs —
    // there's no way to know how the buyer's total splits across variants.
    // Silently falling back to the fixed catalog's own demo quantities was
    // the previous behavior here, and it's actively dangerous: a buyer who
    // typed "20 laptops" could see 120 and 40 awarded instead — a purchase
    // requisition overstating what they asked for by 6-8x, with nothing on
    // screen to say so. Applying their stated quantity to every matched
    // variant is still an assumption, but it errs toward the number the
    // buyer actually typed rather than a stale catalog default, and — unlike
    // the old behavior — it's a flagged assumption the buyer can see and
    // correct, not a silent one.
    const qtyByDescription = new Map(lines.map((l: any, i: number) => [l.description, l.qty] as const));
    const qtyOverrides: Record<string, number> = {};
    const ambiguousQtyLines: { draftLine: string; matchedCatalogIds: string[]; qty: number }[] = [];
    // A draft line with NO catalog match at all (the buyer asked for
    // something the fixed 30-SKU demo catalog simply doesn't carry, e.g. a
    // printer) used to just vanish here — flatMap of an empty array
    // contributes nothing to rfxLineIds, so the line silently never reached
    // the comparison screen with no indication to the buyer it was dropped.
    // That's the same silent-assumption problem as the quantity bug, just
    // for a whole line item instead of a number — surface it instead.
    const unmatchedLines: { draftLine: string; note: string }[] = [];
    matches.forEach((m, i) => {
      if (m.matched_catalog_ids.length === 0) {
        unmatchedLines.push({ draftLine: m.draft_line, note: m.note });
        return;
      }
      const qty = qtyByDescription.get(m.draft_line) ?? lines[i]?.qty;
      if (typeof qty !== "number" || qty <= 0) return;
      for (const catalogId of m.matched_catalog_ids) qtyOverrides[catalogId] = qty;
      if (m.matched_catalog_ids.length > 1) {
        ambiguousQtyLines.push({ draftLine: m.draft_line, matchedCatalogIds: m.matched_catalog_ids, qty });
      }
    });

    return NextResponse.json({ rfxLineIds, matches, qtyOverrides, ambiguousQtyLines, unmatchedLines });
  } catch (err: any) {
    console.error("match-rfx-lines failed:", err);
    return NextResponse.json({ error: err?.message ?? "Matching failed" }, { status: 500 });
  }
}
