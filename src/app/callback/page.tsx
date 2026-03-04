"use client";

import { useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/config";

export default function CallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code || !state) {
      setStatus("error");
      setError("Missing authorization code");
      return;
    }

    // Verify state matches what we stored
    const storedState = localStorage.getItem("tallion_state");
    if (state !== storedState) {
      setStatus("error");
      setError("State mismatch");
      return;
    }

    const codeVerifier = localStorage.getItem("tallion_code_verifier");
    if (!codeVerifier) {
      setStatus("error");
      setError("Missing code verifier");
      return;
    }

    // Exchange the code for tokens
    fetch(`${BASE_PATH}/api/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setStatus("error");
          setError(data.error);
          return;
        }

        // Store tokens in session
        const session = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          customerId: data.customerId,
          connected: true,
        };
        localStorage.setItem("tallion_session", JSON.stringify(session));

        // Clean up
        localStorage.removeItem("tallion_state");
        localStorage.removeItem("tallion_code_verifier");

        setStatus("success");

        // If opened as popup, notify parent and close
        if (window.opener) {
          window.opener.localStorage.setItem(
            "tallion_session",
            JSON.stringify(session),
          );
          window.opener.dispatchEvent(new Event("tallion_connected"));
          window.close();
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Failed to exchange code");
      });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        textAlign: "center",
      }}
    >
      {status === "loading" && <p style={{ fontSize: 18 }}>Connecting...</p>}
      {status === "success" && (
        <div>
          <p style={{ fontSize: 24, color: "#22c55e" }}>Connected!</p>
          <p style={{ color: "#888" }}>You can close this window.</p>
        </div>
      )}
      {status === "error" && (
        <div>
          <p style={{ fontSize: 24, color: "#ef4444" }}>Error</p>
          <p style={{ color: "#888" }}>{error}</p>
        </div>
      )}
    </div>
  );
}
