import Anthropic from "@anthropic-ai/sdk";
import { getComparisonData, computeCheapestPerLine, computeVendorTotals } from "./comparison";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export type AnalystTable = { columns: string[]; rows: (string | number)[][] };
export type AnalystChart = { title: string; unit?: string; categories: string[]; values: number[] };
export type AnalystAnswer = { answer: string; format: "text" | "table" | "chart"; table: AnalystTable | null; chart: AnalystChart | null };
export type AnalystTurn = { role: "user" | "assistant"; content: string };

const RESPOND_TOOL: Anthropic.Tool = {
  name: "respond",
  description: "Answer the buyer's question about the vendor comparison, grounded only in the data provided.",
  input_schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description:
          "A direct, specific answer in plain language — cite vendor names and line items by their description, not internal IDs. If the data doesn't support a confident answer, say so plainly rather than guessing. Always fill this in, even when also returning a table or chart — it's the takeaway, not a caption.",
      },
      format: {
        type: "string",
        enum: ["text", "table", "chart"],
        description:
          "'table' when the question is naturally a list across lines or vendors (e.g. 'show cheapest price per line'). 'chart' when a comparison of a few numbers benefits from a visual (e.g. 'compare vendor totals'). 'text' for everything else — a single fact, a yes/no, an explanation.",
      },
      table: {
        type: ["object", "null"],
        description: "Only when format is 'table'.",
        properties: {
          columns: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: ["string", "number"] } } },
        },
      },
      chart: {
        type: ["object", "null"],
        description: "Only when format is 'chart' — a single-series comparison across a small number of categories (vendors or line items).",
        properties: {
          title: { type: "string" },
          unit: { type: "string", description: "e.g. 'INR' — shown as an axis label." },
          categories: { type: "array", items: { type: "string" } },
          values: { type: "array", items: { type: "number" } },
        },
      },
    },
    required: ["answer", "format"],
  },
};

const SYSTEM = `You are a procurement analyst answering a buyer's questions about a vendor comparison that has already been computed. You are NOT extracting anything new and you must NOT invent prices, vendors, or line items that aren't in the data below — if the data doesn't have what's needed to answer, say so plainly instead of guessing.

All prices in the data are already normalized to INR per unit (currency and per-box conversions are already applied — don't redo any conversion yourself). "Cheapest per line" and "vendor totals" are pre-computed for you below — use those numbers directly rather than re-deriving them from the raw grid, to avoid arithmetic mistakes.

Be specific and concise — a buyer wants a decision-ready answer, not a re-summary of the whole comparison. Reference vendor names and line item descriptions in your answer, not internal IDs like "L03" or "vendorB". Prefer a table when the buyer is asking for a list across several lines or vendors, and a chart when they're comparing a handful of numbers — don't force a table/chart onto a question that's really just a single fact or explanation.`;

// Builds the grounding context handed to the model: this is real, already-
// computed data from the database (extraction results + deterministic
// normalization) — the model's job is to interpret the buyer's question and
// select/explain from these facts, not to do arithmetic or invent numbers.
async function buildContext(selectedLineIds?: string[] | null, qtyOverrides?: Record<string, number>) {
  const { rfxLines, vendors, grid } = await getComparisonData(selectedLineIds, qtyOverrides);
  const cheapestPerLine = computeCheapestPerLine(rfxLines, vendors, grid);
  const vendorTotals = computeVendorTotals(rfxLines, vendors, grid);

  const lines = rfxLines.map((line) => {
    const cheapest = cheapestPerLine[line.id];
    const perVendor = vendors.map((v) => {
      const c = grid[line.id][v.id];
      return {
        vendor: v.name,
        status: c.status,
        unit_price_inr: c.normalizedPriceInr,
        flags: c.flags,
        confidence: c.confidence,
      };
    });
    return {
      line_item: line.description,
      category: line.category,
      qty: line.qty,
      cheapest_verified: cheapest ? { vendor: vendors.find((v) => v.id === cheapest.vendorId)?.name, unit_price_inr: cheapest.priceInr } : null,
      quotes: perVendor,
    };
  });

  const vendorSummaries = vendorTotals.map((v) => ({
    vendor: v.name,
    format: v.format,
    lines_quoted: `${v.linesQuoted}/${v.linesTotal}`,
    estimated_total_inr: Math.round(v.estTotal),
    lines_needing_review: v.reviewCount,
    questionnaire_answers: v.questionnaire,
    notes: v.notes,
  }));

  return JSON.stringify({ line_items: lines, vendors: vendorSummaries }, null, 2);
}

export async function answerAnalystQuestion(
  question: string,
  history: AnalystTurn[],
  selectedLineIds?: string[] | null,
  qtyOverrides?: Record<string, number>
) {
  const context = await buildContext(selectedLineIds, qtyOverrides);
  const allTurns: AnalystTurn[] = [...history, { role: "user", content: question }];

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: `${SYSTEM}\n\nComparison data:\n${context}`,
    tools: [RESPOND_TOOL],
    tool_choice: { type: "tool", name: "respond" },
    messages: allTurns.map((h) => ({ role: h.role, content: h.content })),
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use returned from analyst respond");
  const input = toolUse.input as Partial<AnalystAnswer>;
  return {
    answer: input.answer ?? "",
    format: input.format ?? "text",
    table: input.format === "table" ? input.table ?? null : null,
    chart: input.format === "chart" ? input.chart ?? null : null,
  } as AnalystAnswer;
}
