import { NextResponse } from "next/server";
import { answerAnalystQuestion } from "@/lib/analyst";
import { parseLinesParam } from "@/lib/line-selection";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { question, history, lines } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }
    const { ids: selectedLineIds, qtyOverrides } = parseLinesParam(typeof lines === "string" ? lines : null);
    const result = await answerAnalystQuestion(question, Array.isArray(history) ? history : [], selectedLineIds, qtyOverrides);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("analyst request failed:", err);
    return NextResponse.json({ error: err?.message ?? "The analyst couldn't answer that — please try again." }, { status: 500 });
  }
}
