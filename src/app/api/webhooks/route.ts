import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";

// POST /api/webhooks — Receive Tallion webhook events
export async function POST(req: Request) {
  if (!tally) {
    return NextResponse.json(
      { error: "Tallion not configured" },
      { status: 500 },
    );
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("x-tally-signature") || "";

    // From the SDK README: Verify webhook signature
    const event = await tally.webhooks.verify(body, signature);

    // Handle the event
    switch (event.event) {
      case "transaction.approved":
        console.log("[Webhook] Transaction approved:", event.data);
        break;
      case "transaction.declined":
        console.log("[Webhook] Transaction declined:", event.data);
        break;
      case "transaction.pending_approval":
        console.log("[Webhook] Needs customer approval:", event.data);
        break;
      case "approval.approved":
        console.log("[Webhook] Customer approved:", event.data);
        break;
      default:
        console.log(`[Webhook] ${event.event}:`, event.data);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
