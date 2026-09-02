import Anthropic from "@anthropic-ai/sdk";
import { RFX } from "./rfx-data";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export type CopilotTurn = { role: "user" | "assistant"; content: string };

const RESPOND_TOOL: Anthropic.Tool = {
  name: "respond",
  description: "Respond to the buyer while drafting their RFx. Either ask one clarifying question, or — once you have enough — finalize the RFx.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["question", "draft"] },
      message: {
        type: "string",
        description: "What to say to the buyer — the clarifying question, or a short note introducing the finalized draft.",
      },
      rfx_draft: {
        type: ["object", "null"],
        description: "Only when type is 'draft': the structured RFx.",
        properties: {
          title: { type: "string" },
          scope: { type: "string" },
          delivery_window: { type: "string" },
          delivery_location: { type: "string" },
          questionnaire: { type: "array", items: { type: "string" } },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                description: { type: "string" },
                spec: { type: "string" },
                qty: { type: "number" },
                unit: { type: "string" },
              },
              required: ["category", "description", "spec", "qty", "unit"],
            },
          },
        },
      },
    },
    required: ["type", "message"],
  },
};

const SYSTEM = `You are an RFx drafting co-pilot for a procurement buyer. You turn a short, informal request into a structured RFx: scope, line items with specs and quantities, a short quality questionnaire, and delivery terms.

Before drafting, check every line item the buyer mentioned for genuine VARIANT ambiguity: does this category commonly come in a small number of distinct tiers or configurations that would meaningfully change the spec or price — not just a quantity or color preference? Examples: "laptop" spans standard vs premium/performance specs; "monitor" spans size/resolution tiers; "warranty" spans duration/coverage levels; "storage" spans capacity tiers. If the buyer named the category but not the tier, that line is ambiguous — do not silently pick one, and do not silently split their quantity across multiple tiers. This matters more than it sounds: a buyer who said "20 laptops" and gets a draft quietly covering two different configurations has no way to know their requirement was reinterpreted, and that's exactly the kind of silent assumption that breaks trust in the RFx.

When one or more lines are ambiguous this way, ask about ALL of them together in a single follow-up message ("Quick check on a couple of things: ...") rather than drafting a guess, and rather than asking one at a time across several turns. Keep total clarifying turns to at most 2 overall — real category buyers don't want to be interrogated, so bundle everything genuinely ambiguous into as few messages as possible. Don't ask about things you can reasonably default (standard questionnaire topics: delivery lead time, warranty, on-site support, references, partial shipment — always include these regardless of what the buyer says; things like delivery window/location default from the buyer's org context below unless they say otherwise).

Reference context — the buyer's org is Meridian Financial Services, Bengaluru (Whitefield DC), and this kind of refresh has historically run 15-20 SKUs across laptops/monitors/docks/peripherals/warranties. Use that only as a size sanity-check, not as fixed content — draft from what the buyer actually says.

Once a draft exists (you can see it in the earlier turns), the buyer will often keep talking — asking for line items to be added, removed, or changed, quantities adjusted, terms tweaked, or just asking a question about what you drafted. Treat every message after the first draft as a request against the CURRENT draft, not a new RFx from scratch: apply the change and return type "draft" again with the FULL updated RFx (every line item, not just the changed one — the buyer's screen replaces its whole draft with what you send). Only ask a clarifying question again if the requested change is genuinely ambiguous the same way described above (a new or edited line whose category has distinct tiers and the buyer didn't say which, or a quantity/scope change with no number given). Keep your message on a revision short — a sentence confirming what changed, not a re-summary of the whole RFx.`;

export async function copilotStep(history: CopilotTurn[]) {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 3000,
    system: SYSTEM,
    tools: [RESPOND_TOOL],
    tool_choice: { type: "tool", name: "respond" },
    messages: history.map((h) => ({ role: h.role, content: h.content })),
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use returned");
  return toolUse.input as { type: "question" | "draft"; message: string; rfx_draft?: any };
}
