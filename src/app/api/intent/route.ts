import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";
import { TallionError } from "@tallion/sdk";

// POST /api/intent — Create a purchase intent (Buy Anywhere)
export async function POST(req: Request) {
  if (!tally) {
    return NextResponse.json(
      { error: "Tallion API key not configured." },
      { status: 500 },
    );
  }

  try {
    const { accessToken, item } = await req.json();

    const intent = await tally.intents.create({
      customerToken: accessToken,
      amount: item.price,
      merchant: {
        name: item.restaurant,
        mcc: "5812",
      },
      product: {
        description: `${item.name} from ${item.restaurant}`,
      },
      amountTolerancePct: 15,
    });

    return NextResponse.json({
      intentId: intent.intentId,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      merchantName: intent.merchantName,
      expiresAt: intent.expiresAt,
      transactionId: intent.transactionId,
      card: intent.card
        ? {
            pan: intent.card.pan,
            cvv: intent.card.cvv,
            expMonth: intent.card.expMonth,
            expYear: intent.card.expYear,
            lastFour: intent.card.lastFour,
          }
        : undefined,
    });
  } catch (error) {
    if (error instanceof TallionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("Intent error:", error);
    return NextResponse.json(
      { error: "Failed to create purchase intent" },
      { status: 500 },
    );
  }
}
