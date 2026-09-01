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

    // Only set a qty override when a draft line maps to exactly one catalog
    // line — an ambiguous match (e.g. generic "laptops" spanning three
    // variants) has no unambiguous way to split the buyer's requested
    // quantity across them, so those keep the catalog's own quantity.
    const qtyByDescription = new Map(lines.map((l: any, i: number) => [l.description, l.qty] as const));
    const qtyOverrides: Record<string, number> = {};
    matches.forEach((m, i) => {
      if (m.matched_catalog_ids.length !== 1) return;
      const qty = qtyByDescription.get(m.draft_line) ?? lines[i]?.qty;
      if (typeof qty === "number" && qty > 0) qtyOverrides[m.matched_catalog_ids[0]] = qty;
    });

    return NextResponse.json({ rfxLineIds, matches, qtyOverrides });
  } catch (err: any) {
    console.error("match-rfx-lines failed:", err);
    return NextResponse.json({ error: err?.message ?? "Matching failed" }, { status: 500 });
  }
}
