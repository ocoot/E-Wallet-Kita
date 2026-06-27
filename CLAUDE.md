# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- **Dev server**: `npm run dev` — starts Express+Vite dev server on port 3000 with HMR
- **Build**: `npm run build` — Vite build frontend, then esbuild bundles server.ts → dist/server.cjs
- **Start (prod)**: `npm run start` — node dist/server.cjs
- **Type check**: `npm run lint` — `tsc --noEmit` (typecheck only, no emit)
- **Install**: `npm install`

## Environment

Copy `.env.example` to `.env.local` and fill in credentials. Required vars:
- `GEMINI_API_KEY` — for AI transaction parsing (also supports multi-key/fallback via GEMINI_API_KEY_1–4)
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — Supabase project credentials
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — server-side Supabase admin access
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` — Telegram bot integration
- `SMTP_EMAIL` + `SMTP_PASSWORD` — Gmail SMTP for receipt emails
- `KLIKQRIS_API_KEY` + `KLIKQRIS_MERCHANT_ID` — Premium QRIS payments

## Project Architecture

**E-Wallet Kita** — personal/household financial tracking app (Indonesian market). React 19 + TypeScript + Vite + Tailwind CSS 4 + Supabase, deployed on Vercel.

### Frontend (`src/`)

- **`src/views/`** — Page-level components, lazy-loaded via `React.lazy()` in App.tsx: Dashboard, NewTransaction, History, Budget, BillReminders, Settings, AdminPanel, Login, Onboarding
- **`src/components/`** — Reusable UI pieces (Sidebar, Modal, Breadcrumbs, FeatureLockGate, ReceiptUploader, HistoryTable/Pagination/Filter, DashboardChart/Stats, ExportFullModal, PremiumModal, VoucherClaimModal, SupportChatWidget, etc.)
- **`src/contexts/`** — 7 React Context providers: Auth, Language, Theme, Toast, Admin, Categories, Maintenance. Wrap the app in a specific order in App.tsx
- **`src/hooks/`** — Custom hooks: useAdmin, usePremium, useCategories, useBudgets, useBillReminders, useVoucher
- **`src/lib/`** — Client utilities: `db.ts` (Supabase data service), `supabase.ts` (client init), `premium.ts` (QRIS payments), `receipt.ts` (PDF receipt generation), `parserUtils.ts` (amount text parser), `settings.ts`, `audio.ts`, `email.ts`, `supportFaq.ts`
- **`src/lib/pdf/`** — PDF generation modules (exportPdf, pdfTemplate, pdfBranding, dateRange, logoBase64)
- **`src/locales/`** — `id.json` and `en.json` for i18n (dot-notation key lookup via LanguageContext)

### Backend (`api/`, `server.ts`)

- **`api/`** — Vercel serverless functions (TypeScript files → separate serverless endpoints):
  - `parse-transaction.ts` — AI-powered text parsing with multi-model Gemini fallback chain (7 models), DB-backed per-user rate limiting, 500-char limit
  - `telegram-webhook.ts` — Telegram bot webhook handler (complex handler with multi-model fallback, receipt image parsing, transaction management)
  - `send-receipt.ts` — Send premium receipt via SMTP
  - `health.ts` — Health check endpoint
  - `parse-receipt.ts`, `setup-telegram-webhook.ts`, `_utils.ts`
  - `premium/` — Premium payment endpoints (create-transaction, webhook, status)
  - `admin/` — Admin broadcast tools
- **`api/_lib/`** — Shared server utilities: receipt parser, category inference, Telegram helpers, PDF translator, budget/category logic, bot text templates, maintenance mode
- **`server.ts`** — Express dev server that mounts Vite middleware in dev + static in production. All API routes delegate to the same serverless handlers for single-source-of-truth

### Database (`supabase/`)

- **`supabase/migrations/`** — 30+ numbered SQL migrations: init schema, auth, RLS policies, Telegram bot tables, premium/voucher system, admin features, receipt drafts, bill reminders, support chat, budgets, AI usage tracking, rate limiting
- Key tables: `users`, `transactions`, `categories`, `budgets`, `bill_reminders`, `premium_transactions`, `premium_vouchers`, `receipt_drafts`, `telegram_link_codes`, `telegram_pending`, `support_messages`, `app_settings`, `ai_usage_log`, `api_rate_limits`
- All user-data tables use Row Level Security (RLS) with `user_id = auth.uid()`

### Key Architecture Patterns

- **Theme system**: Dark Obsidian (default) and Light Sakura themes via Tailwind v4 custom variant `@variant light_sakura`. Applied through React Context, no page reload
- **i18n**: Custom Context-based (not a library). Dot-notation key lookup in `id.json`/`en.json`. All UI strings must go through `t()` function. Never hardcode display strings
- **Auth**: Supabase Auth with Google OAuth, Email/Password, Anonymous (Guest) mode. Guest users use `supabase.auth.signInAnonymously()` so RLS still applies
- **Feature lock**: FeatureLockGate component checks premium/user status before rendering certain routes. Some features bypassable in dev/sandbox
- **Real-time**: Supabase Realtime channels for live transaction updates and voucher notifications
- **Rate limiting**: DB-backed via `api_rate_limits` table and `check_and_increment_parse_rate_limit` RPC (not in-memory — Vercel serverless can't share memory)
- **AI parsing**: Multi-model Gemini fallback chain (gemini-3.5-flash → ... → gemini-2.5-flash-lite). Each model has its own timeout and thinking config. Falls back to regex parser if all models fail. Uses structured output (responseSchema with Type.OBJECT)
- **PWA**: vite-plugin-pWA with auto-updating service worker, manifest, install prompt handling in main.tsx
- **Admin panel**: Role-based (`owner`/`admin`/`user`). Separate admin views for maintenance, AI monitoring, broadcast, category management, voucher management, premium monitoring
- **Sandbox mode**: Premium QRIS payments auto-succeed after 8s in development mode for testing
- **Code-splitting**: Every view is lazy-loaded; AdminPanel (heaviest) only loads for admin users

### Common Tasks

- **Add a migration**: Create a new file `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
- **New locale key**: Add to both `src/locales/id.json` and `src/locales/en.json`, then use `t("key.path")`
- **New view**: Create in `src/views/`, add lazy import + Route in App.tsx
- **New API endpoint**: Add handler file in `api/`, register route in `server.ts` for dev parity
- **New context**: Follow existing pattern (create context + provider in `src/contexts/`, wrap in App.tsx)
