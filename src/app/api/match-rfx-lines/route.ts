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
    return NextResponse.json({ rfxLineIds, matches });
  } catch (err: any) {
    console.error("match-rfx-lines failed:", err);
    return NextResponse.json({ error: err?.message ?? "Matching failed" }, { status: 500 });
  }
}
