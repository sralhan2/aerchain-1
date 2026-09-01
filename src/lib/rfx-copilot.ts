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

Ask at most 1-2 clarifying questions total — real category buyers don't want to be interrogated. Once you have enough to draft (category, rough scope/size, any hard constraints), finalize it. Don't ask about things you can reasonably default (standard questionnaire topics: delivery lead time, warranty, on-site support, references, partial shipment — always include these regardless of what the buyer says).

Reference context — the buyer's org is Meridian Financial Services, Bengaluru (Whitefield DC), and this kind of refresh has historically run 15-20 SKUs across laptops/monitors/docks/peripherals/warranties. Use that only as a size sanity-check, not as fixed content — draft from what the buyer actually says.`;

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
