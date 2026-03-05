import { Tallion } from "@tallion/sdk";

let tally: Tallion | null = null;

try {
  tally = new Tallion({
    apiKey: process.env.TALLION_API_KEY || "",
    baseUrl: process.env.TALLION_BASE_URL,
  });
} catch (err) {
  console.error(
    "\n\x1b[31m[Tallion] " + (err instanceof Error ? err.message : err) + "\x1b[0m\n" +
      "  1. Register at https://tallion.ai/developer/register\n" +
      "  2. Create a platform agent to get a sandbox API key\n" +
      "  3. Add it to .env.local:\n" +
      "     TALLION_API_KEY=sk_sandbox_your_key_here\n",
  );
}

export { tally };

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
