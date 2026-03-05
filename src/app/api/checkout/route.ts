import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";

export async function POST(request: Request) {
  try {
    const { accessToken, productUrl, productName, productPriceCents, shipping } =
      await request.json();

    const missing: string[] = [];
    if (!accessToken) missing.push("accessToken");
    if (!productUrl) missing.push("productUrl");
    if (!productPriceCents && productPriceCents !== 0) missing.push("productPriceCents");
    if (!shipping) missing.push("shipping");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    if (!tally) {
      return NextResponse.json({ error: "SDK not configured" }, { status: 503 });
    }

    const session = await tally.checkout.create({
      customerToken: accessToken,
      productUrl,
      productName,
      productPriceCents,
      quantity: 1,
      shipping: {
        name: shipping.name,
        line1: shipping.line1,
        line2: shipping.line2,
        city: shipping.city,
        state: shipping.state,
        zipCode: shipping.zipCode,
        country: shipping.country || "US",
      },
    });

    return NextResponse.json(session);
  } catch (error: any) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Checkout failed" },
      { status: 500 },
    );
  }
}
