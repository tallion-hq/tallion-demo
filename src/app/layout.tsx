import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tallion — AI Shopping Assistant",
  description: "Buy anything, anywhere — AI agent commerce powered by Tallion",
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
