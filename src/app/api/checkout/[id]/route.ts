import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { accessToken } = await request.json();
    const { id } = await params;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Access token required" },
        { status: 401 },
      );
    }

    if (!tally) {
      return NextResponse.json({ error: "SDK not configured" }, { status: 503 });
    }

    const session = await tally.checkout.get(accessToken, id);
    return NextResponse.json(session);
  } catch (error: any) {
    console.error("Checkout status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get status" },
      { status: 500 },
    );
  }
}
