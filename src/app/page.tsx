"use client";

import { useState, useEffect, useRef } from "react";
import { BASE_PATH } from "@/lib/config";

// ── Types ──

interface Session {
  accessToken: string;
  refreshToken: string;
  customerId: string;
  connected: boolean;
}

interface CardData {
  pan: string;
  cvv: string;
  expMonth: number;
  expYear: number;
  lastFour: string;
}

interface IntentData {
  intentId: string;
  status: string;
  amount: number;
  currency: string;
  merchantName: string;
  productName: string;
  card?: CardData;
  asaVerified: boolean;
  asaAmount?: number;
  asaMerchantDescriptor?: string;
  expiresAt?: string;
}

type StepState = "complete" | "active" | "pending" | "error";

interface ChatMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  /** Optional structured content rendered below the text */
  widget?:
    | { type: "products"; products: Product[] }
    | { type: "intent"; intent: IntentData }
    | { type: "code" };
  typing?: boolean;
}

interface Product {
  name: string;
  price: number;
  store: string;
  image: string;
  url: string;
  description: string;
}

// ── Mock Product Catalog ──

const PRODUCT_CATALOG: Record<string, Product[]> = {
  earbuds: [
    {
      name: "Sony WF-1000XM5",
      price: 27999,
      store: "Amazon",
      image: "https://m.media-amazon.com/images/I/61lBG1FjoIL._AC_SL1500_.jpg",
      url: "https://amazon.com/dp/B0C8Y8L2Z3",
      description: "Industry-leading noise canceling, exceptional sound",
    },
    {
      name: "AirPods Pro 2",
      price: 24999,
      store: "Apple Store",
      image: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83",
      url: "https://apple.com/shop/product/MQD83",
      description: "Adaptive Audio, USB-C, 6h battery life",
    },
    {
      name: "Samsung Galaxy Buds3 Pro",
      price: 24999,
      store: "Best Buy",
      image: "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6583/6583520_sd.jpg",
      url: "https://bestbuy.com/site/6583520",
      description: "360 Audio, Blade Lights, 7h battery",
    },
  ],
  laptop: [
    {
      name: 'MacBook Air 15" M3',
      price: 129900,
      store: "Apple Store",
      image: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba15-m3",
      url: "https://apple.com/shop/buy-mac/macbook-air",
      description: '15.3" Liquid Retina, M3 chip, 18h battery',
    },
    {
      name: "ThinkPad X1 Carbon Gen 12",
      price: 147900,
      store: "Lenovo",
      image: "https://p4-ofp.static.pub/fes/cms/2024/02/05/x1carbon-gen12.png",
      url: "https://lenovo.com/us/en/p/laptops/thinkpad/thinkpadx1/thinkpad-x1-carbon-gen-12",
      description: "Intel Ultra 7, 14\" 2.8K OLED, 1kg",
    },
  ],
  headphones: [
    {
      name: "Sony WH-1000XM5",
      price: 34999,
      store: "Amazon",
      image: "https://m.media-amazon.com/images/I/51aXvjzcukL._AC_SL1500_.jpg",
      url: "https://amazon.com/dp/B09XS7JWHH",
      description: "Best-in-class ANC, 30h battery, multipoint",
    },
    {
      name: "AirPods Max",
      price: 54999,
      store: "Apple Store",
      image: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-max",
      url: "https://apple.com/shop/buy-airpods/airpods-max",
      description: "Computational audio, Digital Crown, USB-C",
    },
  ],
  keyboard: [
    {
      name: "Keychron Q1 Pro",
      price: 19900,
      store: "Keychron",
      image: "https://cdn.shopify.com/s/files/1/0059/0630/1017/products/q1-pro.jpg",
      url: "https://keychron.com/products/keychron-q1-pro",
      description: "75% layout, wireless, hot-swappable, aluminum",
    },
    {
      name: "HHKB Professional Hybrid",
      price: 26000,
      store: "Amazon",
      image: "https://m.media-amazon.com/images/I/61LMr5FHKOL._AC_SL1500_.jpg",
      url: "https://amazon.com/dp/B082TQK2SB",
      description: "Topre switches, compact, Bluetooth + USB-C",
    },
  ],
  coffee: [
    {
      name: "Fellow Opus Grinder",
      price: 19500,
      store: "Fellow",
      image: "https://cdn.shopify.com/s/files/1/0057/0643/1923/products/Fellow-Opus.jpg",
      url: "https://fellowproducts.com/products/opus-conical-burr-grinder",
      description: "Conical burr, 41 settings, anti-static",
    },
    {
      name: "Breville Barista Express",
      price: 74995,
      store: "Amazon",
      image: "https://m.media-amazon.com/images/I/71pA2IEjsaL._AC_SL1500_.jpg",
      url: "https://amazon.com/dp/B00CH9QWOU",
      description: "Built-in grinder, PID temp control, steam wand",
    },
  ],
};

const SUGGESTIONS = [
  "Find me wireless earbuds under $300",
  "I need a new laptop for coding",
  "Best noise-canceling headphones",
  "Buy me a mechanical keyboard",
  "I want an espresso setup",
];

// ── Helpers ──

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function maskPan(pan: string): string {
  if (pan.length < 8) return pan;
  return (
    pan.slice(0, 4) +
    " \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 " +
    pan.slice(-4)
  );
}

function formatPan(pan: string): string {
  return pan.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function matchProducts(query: string): Product[] {
  const q = query.toLowerCase();
  for (const [key, products] of Object.entries(PRODUCT_CATALOG)) {
    if (q.includes(key)) return products;
  }
  // Fuzzy match
  if (q.includes("earbud") || q.includes("airpod") || q.includes("bud"))
    return PRODUCT_CATALOG.earbuds;
  if (q.includes("laptop") || q.includes("macbook") || q.includes("computer") || q.includes("coding"))
    return PRODUCT_CATALOG.laptop;
  if (
    q.includes("headphone") ||
    q.includes("noise") ||
    q.includes("over-ear") ||
    q.includes("over ear")
  )
    return PRODUCT_CATALOG.headphones;
  if (q.includes("keyboard") || q.includes("mechanical") || q.includes("typing"))
    return PRODUCT_CATALOG.keyboard;
  if (
    q.includes("coffee") ||
    q.includes("espresso") ||
    q.includes("grinder") ||
    q.includes("brew")
  )
    return PRODUCT_CATALOG.coffee;
  return PRODUCT_CATALOG.earbuds; // default fallback
}

function getStatusColor(status: string): string {
  if (status === "settled" || status === "completed" || status === "authorized")
    return "#22c55e";
  if (
    ["cancelled", "expired", "authorization_failed", "declined"].includes(
      status,
    )
  )
    return "#ef4444";
  return "#E2C97E";
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Creating...",
    card_issued: "Card Active",
    authorized: "Authorized",
    settled: "Settled",
    completed: "Complete",
    cancelled: "Cancelled",
    expired: "Expired",
    authorization_failed: "Failed",
    declined: "Declined",
  };
  return labels[status] || status;
}

function getTimelineSteps(
  intent: IntentData,
): { label: string; detail?: string; state: StepState }[] {
  const { status, asaVerified } = intent;
  const steps: { label: string; detail?: string; state: StepState }[] = [
    { label: "Intent Created", state: "complete" },
    { label: "Virtual Card Issued", state: "pending" },
    { label: "Waiting for Charge", state: "pending" },
    { label: "Network Verified (ASA)", state: "pending" },
    { label: "Settled", state: "pending" },
  ];

  if (status === "card_issued") {
    steps[1].state = "complete";
    steps[1].detail = `Visa ending in ${intent.card?.lastFour || "****"}`;
    steps[2].state = "active";
    steps[2].detail = "Card ready \u2014 awaiting merchant charge";
  } else if (status === "authorized") {
    steps[1].state = "complete";
    steps[2].state = "complete";
    steps[2].detail = intent.asaAmount
      ? `Charged ${formatCents(intent.asaAmount)}`
      : undefined;
    steps[3].state = asaVerified ? "complete" : "active";
    steps[3].detail = asaVerified
      ? `Verified: ${intent.asaMerchantDescriptor || intent.merchantName}`
      : "Verifying...";
    steps[4].state = "active";
  } else if (status === "settled" || status === "completed") {
    steps.forEach((s) => (s.state = "complete"));
    steps[4].detail = "Payment complete \u2014 card destroyed";
  } else if (
    ["cancelled", "expired", "authorization_failed", "declined"].includes(
      status,
    )
  ) {
    steps[1].state = "complete";
    steps[2].state = "error";
    steps[2].detail =
      status === "expired"
        ? "Card expired"
        : status === "cancelled"
          ? "Cancelled"
          : "Authorization failed";
  }
  return steps;
}

let msgCounter = 0;
function msgId(): string {
  return `msg_${++msgCounter}`;
}

// ── Main Component ──

export default function Home() {
  // ── Session ──
  const [session, setSession] = useState<Session | null>(null);
  const [balance, setBalance] = useState<{
    remaining: number;
    fundingAmount: number;
    spentAmount: number;
  } | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const popupRef = useRef<Window | null>(null);

  // ── Chat ──
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: msgId(),
      role: "assistant",
      content:
        "Hi! I\u2019m your shopping assistant powered by Tallion. I can find and purchase products from any store online. What are you looking for?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Intent ──
  const [activeIntent, setActiveIntent] = useState<IntentData | null>(null);
  const [showPan, setShowPan] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // ── Scroll to bottom ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Restore session ──
  useEffect(() => {
    const stored = localStorage.getItem("tallion_session");
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {}
    }

    const handler = () => {
      const stored = localStorage.getItem("tallion_session");
      if (stored) {
        const s = JSON.parse(stored);
        setSession(s);
        if (pendingActionRef.current) {
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          action();
        }
      }
    };
    window.addEventListener("tallion_connected", handler);
    return () => window.removeEventListener("tallion_connected", handler);
  }, []);

  // ── Fetch balance ──
  useEffect(() => {
    if (session?.accessToken) fetchBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── Poll intent status ──
  useEffect(() => {
    if (!activeIntent || !session?.accessToken) return;
    const terminal = [
      "settled",
      "completed",
      "cancelled",
      "expired",
      "authorization_failed",
      "declined",
    ];
    if (terminal.includes(activeIntent.status)) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${BASE_PATH}/api/intent/${activeIntent.intentId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: session.accessToken }),
          },
        );
        const data = await res.json();
        if (!data.error && data.status !== activeIntent.status) {
          setActiveIntent((prev) =>
            prev
              ? {
                  ...prev,
                  status: data.status,
                  asaVerified: data.asaVerified,
                  asaAmount: data.asaAmount,
                  asaMerchantDescriptor: data.asaMerchantDescriptor,
                }
              : null,
          );
        }
      } catch {}
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeIntent?.intentId, activeIntent?.status, session?.accessToken]);

  // ── Auto-hide sensitive data ──
  useEffect(() => {
    if (showPan) {
      const t = setTimeout(() => setShowPan(false), 10000);
      return () => clearTimeout(t);
    }
  }, [showPan]);
  useEffect(() => {
    if (showCvv) {
      const t = setTimeout(() => setShowCvv(false), 10000);
      return () => clearTimeout(t);
    }
  }, [showCvv]);

  // ── Handlers ──

  async function fetchBalance() {
    if (!session) return;
    try {
      const res = await fetch(`${BASE_PATH}/api/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.accessToken }),
      });
      const data = await res.json();
      if (!data.error) setBalance(data);
    } catch {}
  }

  function addMessage(msg: Omit<ChatMessage, "id">): string {
    const id = msgId();
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }

  function updateMessage(id: string, updates: Partial<ChatMessage>) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    );
  }

  async function startOAuth(onComplete: () => void) {
    pendingActionRef.current = onComplete;
    try {
      const res = await fetch(`${BASE_PATH}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.url) {
        localStorage.setItem("tallion_state", data.state);
        localStorage.setItem("tallion_code_verifier", data.codeVerifier);
        popupRef.current = window.open(
          data.url,
          "tallion_auth",
          "width=500,height=700",
        );
        const checker = setInterval(() => {
          if (popupRef.current?.closed) {
            clearInterval(checker);
            if (!localStorage.getItem("tallion_session")) {
              pendingActionRef.current = null;
              addMessage({
                role: "assistant",
                content:
                  "It looks like the authorization was cancelled. Let me know when you\u2019d like to try again!",
              });
            }
          }
        }, 500);
      }
    } catch {
      addMessage({
        role: "assistant",
        content: "Sorry, I couldn\u2019t connect to the payment service. Please try again.",
      });
    }
  }

  async function handleSend(text?: string) {
    const userText = (text || input).trim();
    if (!userText || isThinking) return;
    setInput("");

    addMessage({ role: "user", content: userText });
    setIsThinking(true);

    // Simulate AI "thinking" delay
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));

    const products = matchProducts(userText);
    const typingId = addMessage({
      role: "assistant",
      content: `I found ${products.length} great options for you. Here\u2019s what I\u2019d recommend:`,
      widget: { type: "products", products },
    });

    setIsThinking(false);
  }

  async function handleBuyProduct(product: Product) {
    setSelectedProduct(product);

    addMessage({
      role: "user",
      content: `Buy the ${product.name} from ${product.store} for ${formatCents(product.price)}`,
    });

    const doPurchase = async () => {
      setIsThinking(true);

      const thinkingId = addMessage({
        role: "assistant",
        content: `Processing your purchase of **${product.name}** from ${product.store}...`,
        typing: true,
      });

      // Simulate thinking
      await new Promise((r) => setTimeout(r, 600));

      // Create intent
      try {
        const res = await fetch(`${BASE_PATH}/api/intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: session!.accessToken,
            item: {
              name: product.name,
              price: product.price,
              restaurant: product.store,
            },
          }),
        });
        const data = await res.json();

        if (data.error) {
          updateMessage(thinkingId, {
            content: `Sorry, the purchase couldn\u2019t be processed: ${data.error}`,
            typing: false,
          });
          setIsThinking(false);
          return;
        }

        const intent: IntentData = {
          intentId: data.intentId,
          status: data.status,
          amount: data.amount,
          currency: data.currency,
          merchantName: data.merchantName || product.store,
          productName: product.name,
          card: data.card,
          asaVerified: false,
          expiresAt: data.expiresAt,
        };

        setActiveIntent(intent);

        updateMessage(thinkingId, {
          content: `I\u2019ve created a purchase intent and issued a **single-use virtual Visa card** for ${formatCents(intent.amount)}. The card is scoped exclusively to this purchase at ${intent.merchantName}.\n\nHere\u2019s the live status of your transaction:`,
          widget: { type: "intent", intent },
          typing: false,
        });

        fetchBalance();
      } catch {
        updateMessage(thinkingId, {
          content:
            "Sorry, something went wrong creating the purchase. Please try again.",
          typing: false,
        });
      }
      setIsThinking(false);
    };

    if (!session?.connected) {
      addMessage({
        role: "assistant",
        content:
          "Before I can make this purchase, I need you to authorize me via Tallion. Opening the authorization window...",
      });
      startOAuth(doPurchase);
    } else {
      doPurchase();
    }
  }

  // ── Render ──

  const statusColor = activeIntent
    ? getStatusColor(activeIntent.status)
    : "#E2C97E";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        maxWidth: 860,
        margin: "0 auto",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #1a1a1a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #E2C97E 0%, #c4a85a 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
              color: "#0a0a0a",
            }}
          >
            T
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              Tallion Shopping Assistant
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: "#666" }}>
              Buy anything, anywhere \u2014 powered by AI
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {balance && (
            <span style={{ fontSize: 12, color: "#888" }}>
              Balance: {formatCents(balance.remaining)}
            </span>
          )}
          {session?.connected && (
            <span
              style={{
                fontSize: 10,
                color: "#22c55e",
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid #22c55e44",
                background: "#22c55e11",
              }}
            >
              Connected
            </span>
          )}
        </div>
      </div>

      {/* ── Chat Messages ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 20px 0",
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent:
                msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                maxWidth: msg.widget ? "100%" : "80%",
                width: msg.widget ? "100%" : undefined,
              }}
            >
              {/* Message bubble */}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background:
                    msg.role === "user" ? "#E2C97E22" : "#161616",
                  border: `1px solid ${msg.role === "user" ? "#E2C97E33" : "#222"}`,
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: "#e0e0e0",
                }}
              >
                {msg.content.split("**").map((part, i) =>
                  i % 2 === 1 ? (
                    <strong key={i}>{part}</strong>
                  ) : (
                    <span key={i}>{part}</span>
                  ),
                )}
                {msg.typing && (
                  <span
                    style={{
                      display: "inline-block",
                      marginLeft: 4,
                      animation: "pulse 1.5s infinite",
                    }}
                  >
                    ...
                  </span>
                )}
              </div>

              {/* Widget: Products */}
              {msg.widget?.type === "products" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  {msg.widget.products.map((product) => (
                    <div
                      key={product.name}
                      style={{
                        background: "#161616",
                        borderRadius: 10,
                        border: "1px solid #222",
                        padding: 14,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {product.name}
                        </p>
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 12,
                            color: "#888",
                          }}
                        >
                          {product.description}
                        </p>
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 11,
                            color: "#666",
                          }}
                        >
                          {product.store}
                        </p>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: "auto",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            color: "#f5f5f5",
                          }}
                        >
                          {formatCents(product.price)}
                        </span>
                        <button
                          onClick={() => handleBuyProduct(product)}
                          disabled={isThinking || activeIntent !== null}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 6,
                            border: "none",
                            background: "#E2C97E",
                            color: "#0a0a0a",
                            fontWeight: 600,
                            fontSize: 12,
                            cursor:
                              isThinking || activeIntent
                                ? "default"
                                : "pointer",
                            opacity:
                              isThinking || activeIntent ? 0.4 : 1,
                          }}
                        >
                          Buy Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Widget: Intent / Virtual Card */}
              {msg.widget?.type === "intent" && activeIntent && (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 12,
                    border: `1px solid ${statusColor}33`,
                    background: "#111",
                    overflow: "hidden",
                  }}
                >
                  {/* Intent header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 16px",
                      borderBottom: "1px solid #1a1a1a",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {activeIntent.productName} \u2014{" "}
                      {formatCents(activeIntent.amount)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: statusColor,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "2px 8px",
                        borderRadius: 10,
                        border: `1px solid ${statusColor}44`,
                        background: `${statusColor}11`,
                      }}
                    >
                      {getStatusLabel(activeIntent.status)}
                    </span>
                  </div>

                  {/* Two-column body */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 0,
                    }}
                  >
                    {/* Timeline */}
                    <div
                      style={{
                        padding: "14px 16px",
                        borderRight: "1px solid #1a1a1a",
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 10px",
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#555",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Purchase Timeline
                      </p>
                      {getTimelineSteps(activeIntent).map((step, i, arr) => (
                        <div
                          key={i}
                          style={{ display: "flex", gap: 10 }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              width: 14,
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                width: step.state === "active" ? 10 : 8,
                                height: step.state === "active" ? 10 : 8,
                                borderRadius: "50%",
                                background:
                                  step.state === "complete"
                                    ? "#22c55e"
                                    : step.state === "active"
                                      ? "#E2C97E"
                                      : step.state === "error"
                                        ? "#ef4444"
                                        : "#333",
                                marginTop: 4,
                                boxShadow:
                                  step.state === "active"
                                    ? "0 0 6px #E2C97E44"
                                    : "none",
                              }}
                            />
                            {i < arr.length - 1 && (
                              <div
                                style={{
                                  width: 1.5,
                                  flex: 1,
                                  minHeight: 14,
                                  background:
                                    step.state === "complete"
                                      ? "#22c55e33"
                                      : "#222",
                                }}
                              />
                            )}
                          </div>
                          <div style={{ paddingBottom: 10 }}>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 12,
                                fontWeight: 500,
                                color:
                                  step.state === "complete"
                                    ? "#ccc"
                                    : step.state === "active"
                                      ? "#E2C97E"
                                      : step.state === "error"
                                        ? "#ef4444"
                                        : "#444",
                              }}
                            >
                              {step.state === "complete" && "\u2713 "}
                              {step.state === "error" && "\u2717 "}
                              {step.label}
                            </p>
                            {step.detail && (
                              <p
                                style={{
                                  margin: "1px 0 0",
                                  fontSize: 10,
                                  color: "#555",
                                }}
                              >
                                {step.detail}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Virtual Card */}
                    <div style={{ padding: "14px 16px" }}>
                      <p
                        style={{
                          margin: "0 0 10px",
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#555",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Virtual Card
                      </p>
                      {activeIntent.card && (
                        <div
                          style={{
                            aspectRatio: "1.586",
                            borderRadius: 10,
                            padding: "14px 16px",
                            background:
                              "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                            border: `1px solid ${statusColor}44`,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            position: "relative",
                            boxShadow: `0 2px 16px ${statusColor}11`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 600,
                                color: statusColor,
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                padding: "1px 6px",
                                borderRadius: 3,
                                border: `1px solid ${statusColor}44`,
                              }}
                            >
                              Single-use
                            </span>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "#E2C97E",
                                fontStyle: "italic",
                              }}
                            >
                              VISA
                            </span>
                          </div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 14,
                              color: "#e0e0e0",
                              letterSpacing: "0.12em",
                              fontFamily: "monospace",
                              cursor: "pointer",
                            }}
                            onClick={() => setShowPan(!showPan)}
                          >
                            {showPan
                              ? formatPan(activeIntent.card.pan)
                              : maskPan(activeIntent.card.pan)}
                          </p>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-end",
                            }}
                          >
                            <div>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 8,
                                  color: "#555",
                                  textTransform: "uppercase",
                                }}
                              >
                                Exp
                              </p>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 11,
                                  color: "#bbb",
                                  fontFamily: "monospace",
                                }}
                              >
                                {formatExpiry(
                                  activeIntent.card.expMonth,
                                  activeIntent.card.expYear,
                                )}
                              </p>
                            </div>
                            <div>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 8,
                                  color: "#555",
                                  textTransform: "uppercase",
                                }}
                              >
                                CVV
                              </p>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 11,
                                  color: "#bbb",
                                  fontFamily: "monospace",
                                  cursor: "pointer",
                                }}
                                onClick={() => setShowCvv(!showCvv)}
                              >
                                {showCvv
                                  ? activeIntent.card.cvv
                                  : "\u2022\u2022\u2022"}
                              </p>
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 7,
                                color: "#444",
                                textTransform: "uppercase",
                              }}
                            >
                              Tallion Virtual
                            </p>
                          </div>
                          {/* Settled overlay */}
                          {(activeIntent.status === "settled" ||
                            activeIntent.status === "completed") && (
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: 10,
                                background: "rgba(0,0,0,0.65)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "#22c55e",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.1em",
                                }}
                              >
                                Card Destroyed
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Card details */}
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 11,
                            color: "#666",
                            marginBottom: 3,
                          }}
                        >
                          <span>Merchant</span>
                          <span style={{ color: "#aaa" }}>
                            {activeIntent.merchantName}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 11,
                            color: "#666",
                            marginBottom: 3,
                          }}
                        >
                          <span>Scoped to</span>
                          <span style={{ color: "#aaa" }}>
                            {formatCents(activeIntent.amount)} (+15% tolerance)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {isThinking && (
          <div style={{ display: "flex", marginBottom: 16 }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "#161616",
                border: "1px solid #222",
                fontSize: 14,
                color: "#888",
              }}
            >
              Thinking...
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Suggestions (shown only when no messages from user) ── */}
      {messages.length <= 1 && (
        <div
          style={{
            padding: "0 20px 8px",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSend(suggestion)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border: "1px solid #333",
                background: "transparent",
                color: "#aaa",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* ── Input Bar ── */}
      <div
        style={{
          padding: "12px 20px 16px",
          borderTop: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            background: "#161616",
            borderRadius: 12,
            border: "1px solid #222",
            padding: "8px 12px",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Search for any product..."
            disabled={isThinking}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#f5f5f5",
              fontSize: 14,
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isThinking}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "none",
              background: input.trim() ? "#E2C97E" : "#333",
              color: input.trim() ? "#0a0a0a" : "#666",
              fontWeight: 600,
              fontSize: 13,
              cursor: input.trim() && !isThinking ? "pointer" : "default",
            }}
          >
            Send
          </button>
        </div>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 10,
            color: "#444",
            textAlign: "center",
          }}
        >
          Powered by{" "}
          <a
            href="https://tallion.ai"
            target="_blank"
            style={{ color: "#E2C97E", textDecoration: "none" }}
          >
            Tallion
          </a>{" "}
          \u2014 Every purchase gets its own virtual card, verified at the
          network level
        </p>
      </div>
    </div>
  );
}
