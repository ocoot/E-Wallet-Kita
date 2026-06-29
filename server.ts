import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load environment variables FIRST — before any module that reads process.env
dotenv.config();

// Imports that create Supabase clients at module-level are done dynamically
// after dotenv.config() so env vars are available.

console.log("=== Available Env Variable Keys ===");
console.log(Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("TELEGRAM") || k.includes("PORT") || k.includes("APP")));
console.log("====================================");

/**
 * NOTE: this file used to keep its own GoogleGenAI client + a full copy of
 * the transaction-parsing logic (model call, fallback chain, category
 * inference) for the /api/parse-transaction route below. That copy had
 * drifted badly from the real production handler in
 * api/parse-transaction.ts — missing auth, rate limiting, the multi-model
 * Gemini fallback chain, and DB-driven categories. The route now delegates
 * to that handler directly (see startServer() below), the same pattern
 * already used for broadcast, telegram-webhook, and send-receipt.
 */

import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Backend Client safely
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase Credentials are missing. Database integrations won't work in backend.");
}

const supabaseBackend = createClient(supabaseUrl, supabaseAnonKey);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Indicator
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: process.env.NODE_ENV || "development"
    });
  });

  // Dynamic imports — these modules create Supabase clients at import time,
  // so env vars must already be loaded before they're required.
  const parseTransactionHandler = (await import("./api/parse-transaction")).default;
  const telegramWebhookHandler = (await import("./api/telegram-webhook")).default;
  const sendReceiptHandler = (await import("./api/send-receipt")).default;
  const premiumPaymentHandler = (await import("./api/premium/payment")).default;
  const broadcastHandler = (await import("./api/admin/broadcast")).default;

  // AI transaction parser (Delegated to serverless module — single source
  // of truth in api/parse-transaction.ts: auth check, per-user rate
  // limiting, 500-char query limit, the 7-model Gemini fallback chain, and
  // DB-driven categories all now apply in dev too, not just in production)
  app.post("/api/parse-transaction", parseTransactionHandler as any);

  // Admin Broadcast — unified push + telegram (Delegated to serverless module)
  app.post("/api/admin/broadcast", broadcastHandler as any);

  // Telegram Bot Webhook (Delegated to serverless module — single source of
  // truth in api/telegram-webhook.ts, no duplicated logic here)
  app.post("/api/telegram-webhook", telegramWebhookHandler as any);
  app.post("/api/telegram/webhook", telegramWebhookHandler as any);

  // Send premium receipt email via SMTP (Gmail)
  app.post("/api/send-receipt", sendReceiptHandler as any);

  // Premium payment — create, status check, webhook (Delegated to serverless module)
  app.post("/api/premium/payment", premiumPaymentHandler as any);
  app.get("/api/premium/payment", premiumPaymentHandler as any);
  app.put("/api/premium/payment", premiumPaymentHandler as any);

  // Vite development vs production static handler integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`E-Wallet Kita backend server running on http://0.0.0.0:${PORT}`);
  });
}


startServer();
