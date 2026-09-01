import { NextResponse } from "next/server";
import { copilotStep, type CopilotTurn } from "@/lib/rfx-copilot";

// Claude tool-use calls here can take 15-30s. Vercel's default serverless
// timeout (10s on Hobby) would kill this mid-request otherwise.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { history } = (await req.json()) as { history: CopilotTurn[] };
    const result = await copilotStep(history);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("rfx-copilot error:", err);
    return NextResponse.json(
      { type: "question", message: `Something went wrong on my end: ${err?.message ?? "unknown error"}. Try again?` },
      { status: 500 }
    );
  }
}
