import { NextResponse } from "next/server";
import { tally } from "@/lib/tallion";

// POST /api/auth/exchange — Exchange authorization code for tokens
export async function POST(req: Request) {
  if (!tally) {
    return NextResponse.json(
      { error: "Tallion API key not configured." },
      { status: 500 },
    );
  }

  try {
    const { code, codeVerifier } = await req.json();

    // Step 2 from the SDK README: Exchange the code
    const tokens = await tally.authorize.exchangeCode({
      code,
      codeVerifier,
    });

    return NextResponse.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      customerId: tokens.customerId,
      installationId: tokens.installationId,
    });
  } catch (error) {
    console.error("Token exchange error:", error);
    return NextResponse.json(
      { error: "Failed to exchange authorization code" },
      { status: 500 },
    );
  }
}
