"use client";

import { useState, useEffect, useRef } from "react";

interface Session {
  accessToken: string;
  refreshToken: string;
  customerId: string;
  connected: boolean;
}

interface MenuItem {
  name: string;
  description: string;
  price: number;
  restaurant: string;
  emoji: string;
}

const MENU: MenuItem[] = [
  {
    name: "Classic Burger",
    description: "Angus beef, cheddar, lettuce, tomato",
    price: 1299,
    restaurant: "Burger Joint",
    emoji: "\uD83C\uDF54",
  },
  {
    name: "Margherita Pizza",
    description: "Fresh mozzarella, basil, San Marzano tomatoes",
    price: 1599,
    restaurant: "Pizza Palace",
    emoji: "\uD83C\uDF55",
  },
  {
    name: "Poke Bowl",
    description: "Ahi tuna, avocado, edamame, rice",
    price: 1899,
    restaurant: "Aloha Poke",
    emoji: "\uD83C\uDF5C",
  },
  {
    name: "Caesar Salad",
    description: "Romaine, parmesan, croutons, house dressing",
    price: 1099,
    restaurant: "Green Garden",
    emoji: "\uD83E\uDD57",
  },
  {
    name: "Chicken Tacos",
    description: "Grilled chicken, pico de gallo, lime crema",
    price: 1399,
    restaurant: "Taco Loco",
    emoji: "\uD83C\uDF2E",
  },
  {
    name: "Pad Thai",
    description: "Rice noodles, shrimp, peanuts, bean sprouts",
    price: 1699,
    restaurant: "Thai Express",
    emoji: "\uD83C\uDF5D",
  },
];

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [balance, setBalance] = useState<{
    remaining: number;
    fundingAmount: number;
    spentAmount: number;
  } | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<{
    item: string;
    status: string;
    reason: string;
    txId: string;
  } | null>(null);
  const [error, setError] = useState("");

  // Pending item ref — used to resume order after OAuth completes
  const pendingItemRef = useRef<MenuItem | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Restore session on load
  useEffect(() => {
    const stored = sessionStorage.getItem("tallion_session");
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {}
    }

    // Listen for OAuth popup completing
    const handler = () => {
      const stored = sessionStorage.getItem("tallion_session");
      if (stored) {
        const s = JSON.parse(stored);
        setSession(s);

        // If there's a pending order, process it now
        if (pendingItemRef.current) {
          const item = pendingItemRef.current;
          pendingItemRef.current = null;
          processOrder(item, s.accessToken);
        }
      }
    };
    window.addEventListener("tallion_connected", handler);
    return () => window.removeEventListener("tallion_connected", handler);
  }, []);

  // Fetch balance when session changes
  useEffect(() => {
    if (session?.accessToken) fetchBalance();
  }, [session]);

  async function fetchBalance() {
    if (!session) return;
    try {
      const res = await fetch("/api/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.accessToken }),
      });
      const data = await res.json();
      if (!data.error) setBalance(data);
    } catch {}
  }

  // User clicks "Order" on a menu item
  async function handleOrder(item: MenuItem) {
    if (session?.connected) {
      // Already connected — go straight to purchase
      processOrder(item, session.accessToken);
      return;
    }

    // Not connected — open Tallion authorization popup directly
    setOrdering(item.name);
    setError("");
    pendingItemRef.current = item;

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setOrdering(null);
        pendingItemRef.current = null;
        return;
      }

      if (data.url) {
        sessionStorage.setItem("tallion_state", data.state);
        sessionStorage.setItem("tallion_code_verifier", data.codeVerifier);
        popupRef.current = window.open(
          data.url,
          "tallion_auth",
          "width=500,height=700",
        );

        // Detect if user closes popup without completing
        const checker = setInterval(() => {
          if (popupRef.current?.closed) {
            clearInterval(checker);
            if (!sessionStorage.getItem("tallion_session")) {
              setOrdering(null);
              pendingItemRef.current = null;
            }
          }
        }, 500);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError("Unable to connect to payment service. Please try again.");
      setOrdering(null);
      pendingItemRef.current = null;
    }
  }

  // Process the actual purchase
  async function processOrder(item: MenuItem, accessToken: string) {
    setOrdering(item.name);
    setLastOrder(null);
    setError("");

    try {
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          item: {
            name: item.name,
            price: item.price,
            restaurant: item.restaurant,
          },
        }),
      });
      const data = await res.json();

      setLastOrder({
        item: item.name,
        status: data.status || "error",
        reason: data.decisionReason || data.error || "",
        txId: data.transactionId || "",
      });

      fetchBalance();
    } catch {
      setLastOrder({
        item: item.name,
        status: "error",
        reason: "Something went wrong",
        txId: "",
      });
    } finally {
      setOrdering(null);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
            QuickBite
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "#888" }}>
            AI-powered food ordering
          </p>
        </div>
        {balance && (
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>
            Balance: {formatCents(balance.remaining)}
          </p>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            marginBottom: 24,
            border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.08)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#ef4444" }}>
            {error}
          </p>
        </div>
      )}

      {/* Order status banner */}
      {lastOrder && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            marginBottom: 24,
            border: `1px solid ${
              lastOrder.status === "approved"
                ? "#22c55e"
                : lastOrder.status === "pending_approval"
                  ? "#eab308"
                  : "#ef4444"
            }`,
            background:
              lastOrder.status === "approved"
                ? "rgba(34,197,94,0.08)"
                : lastOrder.status === "pending_approval"
                  ? "rgba(234,179,8,0.08)"
                  : "rgba(239,68,68,0.08)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
            {lastOrder.status === "approved"
              ? `Order confirmed: ${lastOrder.item}`
              : lastOrder.status === "pending_approval"
                ? `Awaiting approval: ${lastOrder.item}`
                : `Order failed: ${lastOrder.item}`}
          </p>
          {lastOrder.reason && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
              {lastOrder.reason}
            </p>
          )}
        </div>
      )}

      {/* Menu grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 12,
        }}
      >
        {MENU.map((item) => (
          <div
            key={item.name}
            style={{
              background: "#161616",
              borderRadius: 12,
              padding: 16,
              border: "1px solid #222",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 24 }}>{item.emoji}</span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  {item.name}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
                {item.description}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                {item.restaurant}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 16 }}>
                {formatCents(item.price)}
              </p>
              <button
                onClick={() => handleOrder(item)}
                disabled={ordering !== null}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#E2C97E",
                  color: "#0a0a0a",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: ordering ? "default" : "pointer",
                  opacity: ordering === item.name ? 0.6 : 1,
                }}
              >
                {ordering === item.name ? "Ordering..." : "Order"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: "1px solid #222",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
          Payments secured by{" "}
          <a
            href="https://tallion.ai"
            target="_blank"
            style={{ color: "#E2C97E", textDecoration: "none" }}
          >
            Tallion
          </a>
        </p>
      </div>
    </div>
  );
}
