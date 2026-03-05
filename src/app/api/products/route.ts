import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";

export async function POST(request: Request) {
  try {
    const { query, accessToken } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    if (!tally) {
      return NextResponse.json({ error: "SDK not configured" }, { status: 503 });
    }

    // Use the SDK to search products
    const result = await tally.products.search(query, {
      maxResults: 10,
      minTrustScore: 50,
    });

    // Map to the format the frontend expects
    const products = result.products.map((p: any) => ({
      name: p.name,
      price: p.priceCents,
      store: p.store,
      image: p.imageUrl || "",
      url: p.url,
      description: `${p.deliveryEstimate ? p.deliveryEstimate + " · " : ""}${p.rating ? `★ ${p.rating}` : ""} · Trust: ${p.trustScore}/100`,
      trustScore: p.trustScore,
      rating: p.rating,
      reviewCount: p.reviewCount,
      deliveryEstimate: p.deliveryEstimate,
      inStock: p.inStock,
    }));

    return NextResponse.json({ products });
  } catch (error: any) {
    console.error("Product search error:", error);
    return NextResponse.json(
      { error: error.message || "Search failed" },
      { status: 500 },
    );
  }
}
