import { NextResponse } from "next/server";
import { answerAnalystQuestion } from "@/lib/analyst";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { question, history, lines } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }
    const selectedLineIds: string[] | null = typeof lines === "string" && lines.length ? lines.split(",").filter(Boolean) : null;
    const answer = await answerAnalystQuestion(question, Array.isArray(history) ? history : [], selectedLineIds);
    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error("analyst request failed:", err);
    return NextResponse.json({ error: err?.message ?? "The analyst couldn't answer that — please try again." }, { status: 500 });
  }
}
