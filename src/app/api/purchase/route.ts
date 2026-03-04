import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";
import { TallionError } from "@tallion/sdk";

// POST /api/purchase — Make a purchase on behalf of the customer
export async function POST(req: Request) {
  if (!tally) {
    return NextResponse.json(
      { error: "Tallion API key not configured." },
      { status: 500 },
    );
  }

  try {
    const { accessToken, item } = await req.json();

    // From the SDK README: Make a purchase
    const tx = await tally.purchase({
      customerToken: accessToken,
      amount: item.price, // in cents
      merchant: {
        name: item.restaurant,
        mcc: "5812", // Eating places & restaurants
        country: "US",
      },
      context: {
        description: `${item.name} from ${item.restaurant}`,
        category: "food",
        lineItems: [
          {
            name: item.name,
            quantity: 1,
            price: item.price,
          },
        ],
        externalReference: `order-${Date.now()}`,
      },
    });

    return NextResponse.json({
      transactionId: tx.transactionId,
      status: tx.status,
      decisionReason: tx.decisionReason,
      amount: tx.amount,
    });
  } catch (error) {
    // From the SDK README: Error handling
    if (error instanceof TallionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("Purchase error:", error);
    return NextResponse.json(
      { error: "Purchase failed" },
      { status: 500 },
    );
  }
}
