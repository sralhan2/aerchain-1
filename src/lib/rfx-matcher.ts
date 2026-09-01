import Anthropic from "@anthropic-ai/sdk";
import { RFX } from "./rfx-data";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// The demo's vendor responses are pre-fabricated against one fixed 18-line
// catalog (see rfx-data.json) — there's no way to generate real vendor
// documents on the fly for whatever a buyer just drafted. So when a buyer
// sends a draft that only asks for a subset (e.g. "laptops, mice, laptop
// bags"), the comparison screen needs to know which of the 18 fixed catalog
// lines that draft actually corresponds to, so it can show only those.
//
// This is a real reasoning step, not string matching: a buyer's free-text
// line ("mice") may not exist as a standalone catalog item (the fixed
// catalog only has a keyboard+mouse combo), or may span several catalog
// variants ("laptops" could mean all three laptop SKUs, or just one). Claude
// makes that judgment call per draft line and explains it.

const MATCH_TOOL: Anthropic.Tool = {
  name: "match_lines",
  description: "Match each of the buyer's draft RFx line items to the closest item(s) in the fixed vendor catalog, if any.",
  input_schema: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            draft_line: { type: "string", description: "The buyer's draft line description, verbatim." },
            matched_catalog_ids: {
              type: "array",
              items: { type: "string" },
              description: "IDs of catalog lines that correspond to this draft line. Empty if nothing in the catalog matches.",
            },
            note: { type: "string", description: "One short phrase on the match — e.g. 'exact match', 'closest available: bundled with keyboard', 'no equivalent in catalog'." },
          },
          required: ["draft_line", "matched_catalog_ids", "note"],
        },
      },
    },
    required: ["matches"],
  },
};

export type LineMatch = { draft_line: string; matched_catalog_ids: string[]; note: string };

export async function matchDraftToCatalog(
  draftLines: { category: string; description: string; spec: string }[]
): Promise<LineMatch[]> {
  const catalogText = RFX.lines.map((l) => `${l.id} | ${l.category} | ${l.description} | ${l.spec}`).join("\n");
  const draftText = draftLines.map((l) => `${l.category} | ${l.description} | ${l.spec}`).join("\n");

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system:
      "You match a buyer's draft RFx line items against a fixed vendor catalog. For each draft line, decide which catalog line ID(s), if any, best correspond to it. A draft line can match multiple catalog IDs (e.g. a generic 'laptops' draft line spanning several laptop variants), one, or none (if the catalog has no equivalent item at all).",
    tools: [MATCH_TOOL],
    tool_choice: { type: "tool", name: "match_lines" },
    messages: [
      {
        role: "user",
        content: `Catalog (id | category | description | spec):\n${catalogText}\n\nBuyer's draft lines (category | description | spec):\n${draftText}`,
      },
    ],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use returned from match_lines");
  return (toolUse.input as { matches: LineMatch[] }).matches;
}
