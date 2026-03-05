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
    | { type: "checkout"; checkout: CheckoutData }
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
  trustScore?: number;
  rating?: number;
  reviewCount?: number;
  deliveryEstimate?: string;
  inStock?: boolean;
  brand?: string;
  condition?: string;
  source?: string;
  vertical?: string;
}

interface CheckoutData {
  id: string;
  status: string;
  progressPct: number;
  productUrl: string;
  productName?: string;
  orderNumber?: string;
  orderTotalCents?: number;
  estimatedDelivery?: string;
  trackingNumber?: string;
  errorMessage?: string;
}

interface AgentStep {
  id: string;
  stepNumber: number;
  stepName: string;
  status: string;
  screenshotUrl?: string;
  pageUrl?: string;
  durationMs?: number;
  errorMessage?: string;
  createdAt: string;
}

interface AgentViewData {
  status: string;
  progressPct: number;
  screenshotUrl?: string;
  productName?: string;
  steps: AgentStep[];
}

// ── Product Search ──

async function searchProducts(query: string): Promise<Product[]> {
  try {
    const res = await fetch(`${BASE_PATH}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    return data.products || [];
  } catch (error) {
    console.error("Product search error:", error);
    // Fallback to empty
    return [];
  }
}

const SUGGESTIONS = [
  "Find me wireless earbuds under $300",
  "I need a new laptop for coding",
  "Search for noise-canceling headphones",
  "Best mechanical keyboards",
  "Find an espresso machine",
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

  // ── Agent View ──
  const [showAgentView, setShowAgentView] = useState(false);
  const [agentViewData, setAgentViewData] = useState<AgentViewData | null>(null);
  const [activeCheckoutId, setActiveCheckoutId] = useState<string | null>(null);
  const agentPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // ── Poll checkout for agent view ──
  useEffect(() => {
    if (!showAgentView || !activeCheckoutId || !session?.accessToken) {
      if (agentPollRef.current) {
        clearInterval(agentPollRef.current);
        agentPollRef.current = null;
      }
      return;
    }

    const terminalStatuses = new Set([
      "completed",
      "failed",
      "cancelled",
      "timeout",
      "card_declined",
      "merchant_blocked",
    ]);

    async function pollAgent() {
      try {
        const [sessionRes, stepsRes] = await Promise.all([
          fetch(`${BASE_PATH}/api/checkout/${activeCheckoutId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: session!.accessToken }),
          }),
          fetch(`${BASE_PATH}/api/checkout/${activeCheckoutId}/steps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: session!.accessToken }),
          }),
        ]);

        const sessionData = await sessionRes.json();
        const stepsData = await stepsRes.json();

        if (!sessionData.error) {
          const latestScreenshot =
            stepsData.steps
              ?.slice()
              .reverse()
              .find((s: AgentStep) => s.screenshotUrl)?.screenshotUrl ||
            sessionData.confirmationScreenshot;

          setAgentViewData({
            status: sessionData.status,
            progressPct: sessionData.progressPct ?? 0,
            screenshotUrl: latestScreenshot,
            productName: sessionData.productName,
            steps: stepsData.steps || [],
          });

          if (terminalStatuses.has(sessionData.status)) {
            if (agentPollRef.current) {
              clearInterval(agentPollRef.current);
              agentPollRef.current = null;
            }
          }
        }
      } catch (e) {
        console.error("Agent view poll error:", e);
      }
    }

    pollAgent();
    agentPollRef.current = setInterval(pollAgent, 2000);

    return () => {
      if (agentPollRef.current) {
        clearInterval(agentPollRef.current);
        agentPollRef.current = null;
      }
    };
  }, [showAgentView, activeCheckoutId, session?.accessToken]);

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

  function getAgentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      queued: "Queued...",
      initializing: "Initializing browser...",
      navigating: "Navigating to store...",
      product_confirmed: "Product confirmed",
      adding_to_cart: "Adding to cart...",
      entering_shipping: "Entering shipping info...",
      entering_payment: "Entering payment details...",
      reviewing_order: "Reviewing order...",
      submitting: "Submitting order...",
      awaiting_3ds: "Waiting for 3DS verification...",
      order_placed: "Order placed!",
      extracting_confirmation: "Extracting confirmation...",
      completed: "Checkout complete!",
      failed: "Checkout failed",
      cancelled: "Checkout cancelled",
      timeout: "Checkout timed out",
      card_declined: "Card declined",
      merchant_blocked: "Merchant blocked",
    };
    return labels[status] || status;
  }

  function getAgentStepState(status: string): "complete" | "active" | "pending" | "error" {
    if (status === "completed" || status === "success") return "complete";
    if (status === "active" || status === "in_progress" || status === "running") return "active";
    if (status === "failed" || status === "error") return "error";
    return "pending";
  }

  async function startOAuth(onComplete: () => void) {
    pendingActionRef.current = onComplete;

    // Open popup immediately (in user-click context) to avoid browser popup blockers.
    // We'll redirect it to the OAuth URL once we have it.
    const popup = window.open("about:blank", "tallion_auth", "width=500,height=700");
    popupRef.current = popup;

    try {
      const res = await fetch(`${BASE_PATH}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.url && popup) {
        localStorage.setItem("tallion_state", data.state);
        localStorage.setItem("tallion_code_verifier", data.codeVerifier);
        popup.location.href = data.url;
        const checker = setInterval(() => {
          if (popup.closed) {
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
      } else if (popup) {
        popup.close();
      }
    } catch {
      if (popup) popup.close();
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

    const products = await searchProducts(userText);
    const typingId = addMessage({
      role: "assistant",
      content: products.length > 0
        ? `I found ${products.length} great options for you. Here\u2019s what I\u2019d recommend:`
        : "I couldn\u2019t find any products matching your search. Try a different query!",
      widget: products.length > 0 ? { type: "products", products } : undefined,
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

      // Read session from localStorage (not captured state) to avoid stale closure after OAuth
      const stored = localStorage.getItem("tallion_session");
      const currentSession = stored ? JSON.parse(stored) : session;

      if (!currentSession?.accessToken) {
        updateMessage(thinkingId, {
          content: "Sorry, I couldn\u2019t find your session. Please try again.",
          typing: false,
        });
        setIsThinking(false);
        return;
      }

      // Create intent
      try {
        const res = await fetch(`${BASE_PATH}/api/intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: currentSession.accessToken,
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
        height: "100vh",
        width: "100%",
      }}
    >
      {/* ── Left Panel: Chat ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          flex: showAgentView ? "1 1 50%" : "1 1 100%",
          maxWidth: showAgentView ? "none" : 860,
          margin: showAgentView ? 0 : "0 auto",
          transition: "all 0.3s ease",
          minWidth: 0,
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
          <button
            onClick={() => setShowAgentView(!showAgentView)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 8,
              border: showAgentView ? "1px solid #E2C97E44" : "1px solid #333",
              background: showAgentView ? "#E2C97E11" : "transparent",
              color: showAgentView ? "#E2C97E" : "#888",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: (activeCheckoutId || activeIntent) ? "#ef4444" : "#555",
                boxShadow: (activeCheckoutId || activeIntent) ? "0 0 6px #ef444488" : "none",
                animation: (activeCheckoutId || activeIntent) ? "pulse 2s infinite" : "none",
              }}
            />
            Watch Agent
          </button>
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
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      {/* Product image */}
                      {product.image ? (
                        <div
                          style={{
                            width: "100%",
                            height: 160,
                            background: "#1a1a1a",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                          }}
                        >
                          <img
                            src={product.image}
                            alt={product.name}
                            style={{
                              maxWidth: "100%",
                              maxHeight: "100%",
                              objectFit: "contain",
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: 80,
                            background: "#1a1a1a",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#333",
                            fontSize: 24,
                          }}
                        >
                          📦
                        </div>
                      )}

                      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                        {/* Product name linked to URL */}
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            margin: 0,
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#f5f5f5",
                            textDecoration: "none",
                            lineHeight: 1.3,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#E2C97E")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#f5f5f5")}
                        >
                          {product.name}
                        </a>

                        {/* Store + source badges */}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: "fit-content",
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#aaa",
                              background: "#222",
                              borderRadius: 4,
                              padding: "2px 6px",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {product.store}
                          </span>
                          {product.source && (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: 9,
                                fontWeight: 500,
                                color: "#E2C97E",
                                background: "rgba(226,201,126,0.1)",
                                borderRadius: 4,
                                padding: "2px 5px",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}
                            >
                              via {product.source}
                            </span>
                          )}
                          {product.brand && (
                            <span style={{ fontSize: 10, color: "#888" }}>
                              {product.brand}
                            </span>
                          )}
                          {product.condition && product.condition !== "new" && (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: 9,
                                fontWeight: 500,
                                color: "#f0ad4e",
                                background: "rgba(240,173,78,0.1)",
                                borderRadius: 4,
                                padding: "2px 5px",
                                textTransform: "uppercase",
                              }}
                            >
                              {product.condition}
                            </span>
                          )}
                        </div>

                        {/* Rating + reviews */}
                        {product.rating != null && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                            <span style={{ color: "#E2C97E" }}>
                              {"★".repeat(Math.round(product.rating))}
                              {"☆".repeat(5 - Math.round(product.rating))}
                            </span>
                            <span style={{ color: "#888" }}>
                              {product.rating.toFixed(1)}
                              {product.reviewCount != null && ` (${product.reviewCount.toLocaleString()})`}
                            </span>
                          </div>
                        )}

                        {/* Delivery estimate */}
                        {product.deliveryEstimate && (
                          <p style={{ margin: 0, fontSize: 11, color: "#6b8" }}>
                            🚚 {product.deliveryEstimate}
                          </p>
                        )}

                        {/* Price + actions */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: "auto",
                            paddingTop: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              color: "#f5f5f5",
                            }}
                          >
                            {formatCents(product.price)}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {product.url && (
                              <a
                                href={product.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 6,
                                  border: "1px solid #333",
                                  background: "transparent",
                                  color: "#aaa",
                                  fontWeight: 500,
                                  fontSize: 11,
                                  textDecoration: "none",
                                  cursor: "pointer",
                                }}
                              >
                                View
                              </a>
                            )}
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

      {/* ── Right Panel: Agent View ── */}
      {showAgentView && (
        <div
          style={{
            flex: "1 1 50%",
            borderLeft: "1px solid #1a1a1a",
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            background: "#0a0a0a",
            minWidth: 0,
          }}
        >
          {/* Agent View Header */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #1a1a1a",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: (activeCheckoutId || activeIntent) ? "#ef4444" : "#555",
                boxShadow: (activeCheckoutId || activeIntent) ? "0 0 8px #ef444488" : "none",
                animation: (activeCheckoutId || activeIntent) ? "pulse 2s infinite" : "none",
              }}
            />
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#f5f5f5" }}>
              Live Agent View
            </h2>
            {(agentViewData?.productName || activeIntent?.productName) && (
              <span style={{ fontSize: 11, color: "#888", marginLeft: "auto" }}>
                {agentViewData?.productName || activeIntent?.productName}
              </span>
            )}
          </div>

          {/* Agent View Body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {!activeCheckoutId && !activeIntent ? (
              /* No active checkout or intent */
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: "#555",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "#161616",
                    border: "1px solid #222",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  {"\uD83D\uDD0D"}
                </div>
                <p style={{ margin: 0, fontSize: 13, textAlign: "center" }}>
                  No active checkout session.
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#444", textAlign: "center" }}>
                  Start a purchase to watch the agent in real-time.
                </p>
              </div>
            ) : (
              <>
                {/* Screenshot Area */}
                <div
                  style={{
                    borderRadius: 10,
                    border: "1px solid #222",
                    background: "#111",
                    overflow: "hidden",
                    aspectRatio: "16/10",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  {agentViewData?.screenshotUrl ? (
                    <img
                      src={agentViewData.screenshotUrl}
                      alt="Agent screenshot"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        background: "#000",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        color: "#444",
                      }}
                    >
                      {activeCheckoutId ? (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            border: "2px solid #333",
                            borderTopColor: "#E2C97E",
                            animation: "spin 1s linear infinite",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: "#1a1a2e",
                            border: "1px solid #222",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                          }}
                        >
                          {"\uD83D\uDCB3"}
                        </div>
                      )}
                      <span style={{ fontSize: 11 }}>
                        {activeCheckoutId
                          ? "Waiting for screenshot..."
                          : "Agent screenshots will appear here during checkout"}
                      </span>
                    </div>
                  )}
                  {/* Live badge */}
                  {activeCheckoutId && agentViewData && !["completed", "failed", "cancelled", "timeout", "card_declined", "merchant_blocked"].includes(agentViewData.status) && (
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "rgba(0,0,0,0.7)",
                        backdropFilter: "blur(4px)",
                        border: "1px solid #ef444444",
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: "#ef4444",
                          animation: "pulse 2s infinite",
                        }}
                      />
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Live
                      </span>
                    </div>
                  )}
                </div>

                {/* Status + Progress */}
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: "#111",
                    border: "1px solid #222",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#e0e0e0" }}>
                      {activeCheckoutId && agentViewData
                        ? getAgentStatusLabel(agentViewData.status)
                        : activeIntent
                          ? `Intent: ${getStatusLabel(activeIntent.status)}`
                          : "Initializing..."}
                    </span>
                    <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>
                      {activeCheckoutId
                        ? `${agentViewData?.progressPct ?? 0}%`
                        : activeIntent
                          ? getStatusLabel(activeIntent.status)
                          : "0%"}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div
                    style={{
                      width: "100%",
                      height: 4,
                      borderRadius: 2,
                      background: "#222",
                      overflow: "hidden",
                    }}
                  >
                    {(() => {
                      const pct = activeCheckoutId
                        ? (agentViewData?.progressPct ?? 0)
                        : activeIntent
                          ? (["settled", "completed"].includes(activeIntent.status) ? 100
                            : ["authorized"].includes(activeIntent.status) ? 75
                            : ["card_issued"].includes(activeIntent.status) ? 40
                            : 15)
                          : 0;
                      const terminalOk = activeCheckoutId
                        ? agentViewData?.status === "completed"
                        : activeIntent && ["settled", "completed"].includes(activeIntent.status);
                      const terminalFail = activeCheckoutId
                        ? (agentViewData?.status === "failed" || agentViewData?.status === "card_declined")
                        : activeIntent && ["cancelled", "expired", "authorization_failed", "declined"].includes(activeIntent.status);
                      return (
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            borderRadius: 2,
                            background: terminalOk
                              ? "#22c55e"
                              : terminalFail
                                ? "#ef4444"
                                : "linear-gradient(90deg, #E2C97E, #c4a85a)",
                            transition: "width 0.5s ease",
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>

                {/* Step Timeline */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: "#111",
                    border: "1px solid #222",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#555",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Checkout Steps
                  </p>
                  {activeCheckoutId && agentViewData && agentViewData.steps.length > 0 ? (
                    agentViewData.steps.map((step, i, arr) => {
                      const state = getAgentStepState(step.status);
                      return (
                        <div key={step.id} style={{ display: "flex", gap: 10 }}>
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
                                width: state === "active" ? 10 : 8,
                                height: state === "active" ? 10 : 8,
                                borderRadius: "50%",
                                background:
                                  state === "complete"
                                    ? "#22c55e"
                                    : state === "active"
                                      ? "#E2C97E"
                                      : state === "error"
                                        ? "#ef4444"
                                        : "#333",
                                marginTop: 4,
                                boxShadow:
                                  state === "active" ? "0 0 6px #E2C97E44" : "none",
                              }}
                            />
                            {i < arr.length - 1 && (
                              <div
                                style={{
                                  width: 1.5,
                                  flex: 1,
                                  minHeight: 14,
                                  background:
                                    state === "complete" ? "#22c55e33" : "#222",
                                }}
                              />
                            )}
                          </div>
                          <div style={{ paddingBottom: 10, minWidth: 0 }}>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 12,
                                fontWeight: 500,
                                color:
                                  state === "complete"
                                    ? "#ccc"
                                    : state === "active"
                                      ? "#E2C97E"
                                      : state === "error"
                                        ? "#ef4444"
                                        : "#444",
                              }}
                            >
                              {state === "complete" && "\u2713 "}
                              {state === "active" && "\u25C9 "}
                              {state === "error" && "\u2717 "}
                              {step.stepName}
                            </p>
                            {step.durationMs && (
                              <p
                                style={{
                                  margin: "1px 0 0",
                                  fontSize: 10,
                                  color: "#555",
                                }}
                              >
                                {(step.durationMs / 1000).toFixed(1)}s
                              </p>
                            )}
                            {step.errorMessage && (
                              <p
                                style={{
                                  margin: "1px 0 0",
                                  fontSize: 10,
                                  color: "#ef4444",
                                }}
                              >
                                {step.errorMessage}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    /* Use intent timeline when no checkout steps */
                    <>
                      {(activeIntent ? getTimelineSteps(activeIntent) : [
                        { label: "Intent Created", state: "complete" as StepState },
                        { label: "Card Issued", state: "pending" as StepState },
                        { label: "Navigating to Store", state: "pending" as StepState },
                        { label: "Adding to Cart", state: "pending" as StepState },
                        { label: "Entering Payment", state: "pending" as StepState },
                        { label: "Order Confirmed", state: "pending" as StepState },
                      ]).map((step, i, arr) => (
                        <div key={i} style={{ display: "flex", gap: 10 }}>
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
                                background: step.state === "complete"
                                  ? "#22c55e"
                                  : step.state === "active"
                                    ? "#E2C97E"
                                    : step.state === "error"
                                      ? "#ef4444"
                                      : "#333",
                                marginTop: 4,
                                boxShadow: step.state === "active" ? "0 0 6px #E2C97E44" : "none",
                              }}
                            />
                            {i < arr.length - 1 && (
                              <div
                                style={{
                                  width: 1.5,
                                  flex: 1,
                                  minHeight: 14,
                                  background: step.state === "complete" ? "#22c55e33" : "#222",
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
                                color: step.state === "complete"
                                  ? "#ccc"
                                  : step.state === "active"
                                    ? "#E2C97E"
                                    : step.state === "error"
                                      ? "#ef4444"
                                      : "#444",
                              }}
                            >
                              {step.state === "complete" ? "\u2713 " : step.state === "active" ? "\u25C9 " : step.state === "error" ? "\u2717 " : "\u25CB "}
                              {step.label}
                            </p>
                            {"detail" in step && step.detail && (
                              <p style={{ margin: "1px 0 0", fontSize: 10, color: "#555" }}>
                                {step.detail}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
