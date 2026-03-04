import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";

// POST /api/intent/[id] — Get purchase intent status
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

    const status = await tally.intents.get(accessToken, id);

    return NextResponse.json({
      intentId: status.intentId,
      status: status.status,
      amount: status.amount,
      currency: status.currency,
      merchantName: status.merchantName,
      cardLastFour: status.cardLastFour,
      asaVerified: status.asaVerified,
      asaAmount: status.asaAmount,
      asaMerchantDescriptor: status.asaMerchantDescriptor,
      asaMismatchReason: status.asaMismatchReason,
      transactionId: status.transactionId,
      expiresAt: status.expiresAt,
      createdAt: status.createdAt,
    });
  } catch (error) {
    console.error("Intent status error:", error);
    return NextResponse.json(
      { error: "Failed to get intent status" },
      { status: 500 },
    );
  }
}
