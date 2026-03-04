import { NextResponse } from "next/server";
import { TallionError } from "@tallion/sdk";
import { tally, APP_URL } from "@/lib/tallion";

// POST /api/auth — Start the Tallion OAuth flow
export async function POST() {
  if (!tally) {
    return NextResponse.json(
      {
        error:
          "Tallion API key not configured. Visit https://tallion.ai/developer to get one.",
      },
      { status: 500 },
    );
  }

  try {
    // No phone needed — the Tallion hosted authorization page handles
    // customer verification, funding, and limit setup.
    const { url, state, codeVerifier } = await tally.authorize.createUrl({
      redirectUrl: `${APP_URL}/callback`,
      scopes: ["purchase", "balance:read"],
      suggestedLimits: {
        maxPerTransaction: 10000, // $100.00
        maxPerDay: 50000, // $500.00
        requireApprovalAbove: 5000, // $50.00
      },
    });

    return NextResponse.json({ url, state, codeVerifier });
  } catch (error) {
    if (error instanceof TallionError) {
      console.error(`[Tallion] ${error.status}: ${error.message}`);
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Failed to create authorization" },
      { status: 500 },
    );
  }
}
