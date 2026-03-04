import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QuickBite — AI Food Ordering",
  description: "Order food with AI, powered by Tallion spend control",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: "#0a0a0a",
          color: "#f5f5f5",
        }}
      >
        {children}
      </body>
    </html>
  );
}
