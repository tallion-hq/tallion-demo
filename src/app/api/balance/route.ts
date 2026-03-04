import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";

// POST /api/balance — Get the customer's wallet balance
export async function POST(req: Request) {
  if (!tally) {
    return NextResponse.json(
      { error: "Tallion API key not configured." },
      { status: 500 },
    );
  }

  try {
    const { accessToken } = await req.json();

    // From the SDK README: Check balance
    const balance = await tally.balance(accessToken);

    return NextResponse.json({
      remaining: balance.remaining,
      fundingAmount: balance.fundingAmount,
      spentAmount: balance.spentAmount,
      walletId: balance.walletId,
    });
  } catch (error) {
    console.error("Balance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 },
    );
  }
}
