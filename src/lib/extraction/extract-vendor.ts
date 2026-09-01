import Anthropic from "@anthropic-ai/sdk";
import { RFX } from "../rfx-data";
import type { ParsedSource } from "./parse-source";

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export type ExtractedLine = {
  matched_rfx_line_id: string | null;
  vendor_description: string;
  unit_price: number | null;
  currency: string | null;
  unit_price_basis: "per_unit" | "per_box_of_5" | "other" | "unknown";
  confidence: number;
  source_citation: string;
  flags: string[];
};

export type ExtractionResult = {
  currency_detected: string;
  lines: ExtractedLine[];
  unmatched_rfx_line_ids: string[];
  questionnaire_answers: { question: string; answer: string }[];
  vendor_notes: string;
};

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "submit_extraction",
  description:
    "Submit the structured extraction of a vendor's RFx response: line-item pricing matched to the buyer's RFx, questionnaire answers, and any commercial notes.",
  input_schema: {
    type: "object",
    properties: {
      currency_detected: {
        type: "string",
        description: "The primary currency this vendor quoted in, e.g. INR or USD. If mixed, use the dominant one.",
      },
      lines: {
        type: "array",
        description:
          "One entry per priced line item found in the source document. Include every price you find, even if you can't confidently match it to an RFx line (use null for matched_rfx_line_id in that case).",
        items: {
          type: "object",
          properties: {
            matched_rfx_line_id: {
              type: ["string", "null"],
              description: "The RFx line ID (e.g. L01) this best matches, or null if you cannot confidently match it to any RFx line.",
            },
            vendor_description: { type: "string", description: "The item description exactly as the vendor wrote it." },
            unit_price: { type: ["number", "null"], description: "The numeric unit price, or null if genuinely unpriced/ambiguous." },
            currency: { type: ["string", "null"], description: "Currency of this specific price, e.g. INR or USD." },
            unit_price_basis: {
              type: "string",
              enum: ["per_unit", "per_box_of_5", "other", "unknown"],
              description: "What the price is actually for. Flag clearly if it's not a simple per-unit price (e.g. sold per box of 5).",
            },
            confidence: {
              type: "number",
              description: "Your confidence (0 to 1) that this price and its match to the RFx line are correct.",
            },
            source_citation: {
              type: "string",
              description: "A short verbatim quote or cell/row reference from the source document that supports this extraction.",
            },
            flags: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "currency_mismatch",
                  "unit_mismatch",
                  "partial_quote",
                  "ambiguous_pricing",
                  "footnote_discount",
                  "low_image_confidence",
                  "other",
                ],
              },
              description:
                "unit_mismatch: priced per box/pack/set instead of the RFx's per-unit ask. currency_mismatch: priced in a currency other than the RFx's (INR). Use these specific flags whenever they apply, before falling back to other.",
            },
          },
          required: ["vendor_description", "matched_rfx_line_id", "unit_price", "currency", "unit_price_basis", "confidence", "source_citation", "flags"],
        },
      },
      unmatched_rfx_line_ids: {
        type: "array",
        items: { type: "string" },
        description: "RFx line IDs that this vendor did NOT quote at all — do not guess a price for these.",
      },
      questionnaire_answers: {
        type: "array",
        items: {
          type: "object",
          properties: { question: { type: "string" }, answer: { type: "string" } },
          required: ["question", "answer"],
        },
        description: "Answers to the RFx questionnaire found anywhere in the source (may be partial).",
      },
      vendor_notes: {
        type: "string",
        description:
          "Any commercially significant free text that doesn't fit as a line item: footnote discounts, exclusions, freight terms, payment terms, ambiguous carryover pricing, etc. Be specific about what's ambiguous and why — never resolve the ambiguity yourself.",
      },
    },
    required: ["currency_detected", "lines", "unmatched_rfx_line_ids", "questionnaire_answers", "vendor_notes"],
  },
};

function rfxLineSchemaForPrompt() {
  return RFX.lines
    .map((l) => `${l.id} | ${l.category} | ${l.description} | ${l.spec} | qty ${l.qty} ${l.unit}`)
    .join("\n");
}

export async function extractVendorResponse(
  vendorName: string,
  source: ParsedSource,
  extraText?: string
): Promise<ExtractionResult> {
  const systemPrompt = `You are a procurement extraction analyst. You read a vendor's RFx response, in whatever format it arrives, and extract structured line-item pricing against the buyer's original RFx.

Rules:
- Never invent a price. If a line isn't quoted, or the vendor says something like "same as last year" with no number given anywhere in the document, do NOT supply a number — list it in unmatched_rfx_line_ids or give it null unit_price with a flag, and explain in vendor_notes.
- Never silently convert currency or units — extract exactly what's written (basis and currency as stated) and flag it. Conversion happens downstream, not by you.
- Every extracted line needs a source_citation — a short verbatim snippet or cell/row reference that a human could use to find it in the original document.
- Confidence should be genuinely calibrated: a clearly printed, unambiguous price is high confidence; a price read from an angled/blurry photo, or one that required inference, is lower.
- Match vendor line items to the buyer's RFx lines by meaning, not exact text — vendors describe things in their own words.

The buyer's RFx line items (id | category | description | spec | quantity):
${rfxLineSchemaForPrompt()}

The RFx questionnaire:
${RFX.questionnaire.map((q, i) => `${i + 1}. ${q.q}`).join("\n")}`;

  // Some vendors submitted their response as more than one file (e.g. a
  // rate-card photo plus a separate questionnaire doc) — extraText carries
  // any additional source text so it's extracted from the same pass rather
  // than silently dropped.
  const extraBlock = extraText
    ? `\n\nThis vendor also submitted a separate document alongside the above — its content:\n\n${extraText}`
    : "";

  const userContent: Anthropic.MessageParam["content"] =
    source.kind === "text"
      ? [
          {
            type: "text",
            text: `Vendor: ${vendorName}\n\nHere is the raw content of their RFx response (parsed from the original file):\n\n${source.text}${extraBlock}`,
          },
        ]
      : [
          {
            type: "image",
            source: { type: "base64", media_type: source.mediaType, data: source.base64 },
          },
          {
            type: "text",
            text: `Vendor: ${vendorName}\n\nThe above image is a photo of this vendor's printed rate card, submitted as their RFx response. Extract everything you can read from it.${extraBlock}`,
          },
        ];

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: systemPrompt,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "submit_extraction" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error(`No tool_use block returned for vendor ${vendorName}`);

  return toolUse.input as ExtractionResult;
}
