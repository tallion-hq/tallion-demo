import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";

// POST /api/intent/[id]/cancel — Cancel a purchase intent
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!tally) {
    return NextResponse.json(
      { error: "Tallion API key not configured." },
      { status: 500 },
    );
  }

  try {
    const { id } = await params;
    const { accessToken } = await req.json();

    const result = await tally.intents.cancel(accessToken, id);

    return NextResponse.json({
      intentId: result.intentId,
      status: result.status,
    });
  } catch (error) {
    console.error("Intent cancel error:", error);
    return NextResponse.json(
      { error: "Failed to cancel intent" },
      { status: 500 },
    );
  }
}
