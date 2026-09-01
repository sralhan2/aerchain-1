import { getExtractionStatus } from "@/lib/store";
import { RFX } from "@/lib/rfx-data";
import { VENDOR_META } from "@/lib/vendors";
import { InboxClient } from "@/components/InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ lines?: string }> }) {
  const { lines: linesParam } = await searchParams;
  const rows = await getExtractionStatus();
  const initialStatus: Record<string, { linesExtracted: number } | null> = {};
  for (const v of VENDOR_META) {
    const row = rows.find((r) => r.vendor_id === v.id);
    initialStatus[v.id] = row ? { linesExtracted: row.n } : null;
  }

  const selectedIds = linesParam ? linesParam.split(",").filter(Boolean) : null;
  const lineCount = selectedIds ? selectedIds.length : RFX.lines.length;
  const comparisonHref = linesParam ? `/comparison?lines=${encodeURIComponent(linesParam)}` : "/comparison";

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white px-8 py-5">
        <div className="text-xs font-mono uppercase tracking-wider text-orange-700">RFx Copilot · Vendor Inbox</div>
        <h1 className="text-2xl font-semibold mt-1">{RFX.title}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Sent to {VENDOR_META.length} vendors on {RFX.issuedDate} · due {RFX.dueDate} · {lineCount} line item{lineCount === 1 ? "" : "s"}
          {selectedIds ? " matched to your draft" : ""}
        </p>
      </header>

      <div className="px-8 py-4 text-sm text-neutral-500">
        Four responses have come back, each in the vendor's own format — nothing was forced into your template. Run extraction to
        read them into a structured comparison.
      </div>

      <InboxClient initialStatus={initialStatus} comparisonHref={comparisonHref} />
    </div>
  );
}
