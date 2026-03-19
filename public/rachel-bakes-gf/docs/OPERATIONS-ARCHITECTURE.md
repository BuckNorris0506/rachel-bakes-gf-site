# Rachel Bakes GF — Lightweight Operations Architecture

**Purpose:** Real (non-demo) support for (1) waitlist notification when ordering opens, and (2) daily revenue cap with automatic preorder closure — without building a full ecommerce platform.

---

## PART 1 — Architecture and Implementation Plan

### 1.1 Design principles

- **Single source of truth:** Ordering state and config live in a small backend/database, not in static JS.
- **Thin backend:** Serverless functions + small DB. No always-on app server.
- **Structured but minimal data:** Only what’s needed for waitlist, orders, cap, and admin.
- **Clear split:** Static site stays static; only signup, order submit, config read, and admin actions go through the backend.

---

### 1.2 Storing waitlist signups

- **Table (or equivalent):** `waitlist`
  - `id`, `email` (required), `name` (optional), `created_at`
  - Optional: `notified_at` (set when we send “ordering is open” so we don’t double-email).
- **Flow:** Notification signup form POSTs to a serverless endpoint; endpoint validates email, inserts row, returns success/error. No mailto.
- **Where it runs:** One serverless function (e.g. `POST /api/waitlist` or `/.netlify/functions/waitlist`) backed by the same DB used below.

---

### 1.3 Triggering automatic notifications when preorder opens

- **Trigger:** Admin action “Open preorder” (or equivalent) that:
  1. Sets `preorder_open = true` in config.
  2. Fetches all waitlist rows where `notified_at` is null (or all, if you don’t track notified).
  3. Sends one “Rachel Bakes GF is now taking orders…” email per address via a transactional email API.
  4. Optionally sets `notified_at = now()` for each.
- **No cron needed:** Notifications fire only when admin explicitly opens preorder (or when a scheduled “open” runs once — still one action, not polling).
- **Email provider:** One transactional sender (Resend, SendGrid, Postmark, or SES). Resend is simple and has a generous free tier; template is a single HTML/text “we’re open” message with a link to the order page.
- **Rate / batching:** For small lists (< hundreds), sequential send in one function is fine. For larger lists, enqueue per-recipient jobs or batch in chunks (e.g. 50) to avoid timeouts; still one “open preorder” action that kicks it off.

---

### 1.4 Handling order submissions in a structured way

- **Table:** `preorders`
  - `id`, `name`, `contact` (email/phone), `order_summary` (text: what they want), `pickup_date`, `pickup_window`, `notes`
  - **`amount_cents` (integer, required):** Order total in cents. Used for daily cap. Customer or frontend supplies it; Rachel can confirm/amend when she confirms the order.
  - `created_at` (server-set; defines “today” for cap).
- **Flow:** Order form POSTs to e.g. `POST /api/preorders`. Backend:
  1. Checks that preorder is open and today’s total + this order’s `amount_cents` ≤ daily cap (see below).
  2. If over cap: return 4xx, e.g. “Preorder is full for today”; frontend shows message and optionally refreshes ordering status.
  3. If under cap: insert row, then recompute today’s total; if new total ≥ cap, set `preorder_open = false` (so next visitor sees closed).
- **Custom orders:** Separate form and table (e.g. `custom_orders`). No daily cap; separate toggle `custom_orders_open`. Same idea: POST to `/api/custom-orders`, store, optionally email Rachel. Not covered in cap logic.

---

### 1.5 Tracking daily order totals and auto-closing preorder

- **Definition of “today”:** Use the server’s date (or a configured timezone) for “order date.” Store `created_at` on each preorder; “today’s total” = sum of `amount_cents` for preorders where `date(created_at) = today`.
  - **Implementation note (current slice):** the Netlify functions now compute “today” using **America/Chicago day boundaries** (`created_at` between local-midnight boundaries, converted to UTC for PostgREST).
- **Config table (or key-value):**
  - `preorder_open` (boolean)
  - `custom_orders_open` (boolean)
  - `daily_cap_cents` (integer, e.g. 100000 = $1000)
  - `status_message` (string)
- **Logic:**
  - When serving the order form or “is preorder open?” API: if `preorder_open` is false, show closed. If true, compute `today_total_cents = SUM(amount_cents) WHERE date(created_at) = today`; if `today_total_cents >= daily_cap_cents`, treat as closed for display and reject new submissions.
  - After each new preorder insert: recompute today’s total; if `today_total_cents >= daily_cap_cents`, set `preorder_open = false`.
- **Daily reset:** No separate “reset” job required. Next calendar day, `today` is a new day, so the sum is over the new day’s orders only. If you want to “roll over” or use a custom “bake day” that isn’t midnight, you can add a `order_date` field set by the backend (e.g. from pickup_date or a business-day rule) and sum on that instead; for the lean version, `created_at` date is enough.

---

### 1.6 Keeping custom orders separate

- **Data:** `custom_orders` table (or similar); no `amount_cents` in cap logic.
- **Config:** `custom_orders_open` independent of `preorder_open` and of `daily_cap_cents`.
- **Cap:** Applies only to `preorders` and only when `preorder_open` is true. Custom form stays available when `custom_orders_open` is true regardless of cap.

---

### 1.7 Simple admin control surface

- **Single admin page** (e.g. `/rachel-bakes-gf/admin/` or `/admin`), protected by a secret path or simple password (e.g. query param or HTTP basic auth; no full auth system for v1).
- **Read:** Current config (`preorder_open`, `custom_orders_open`, `daily_cap_cents`, `status_message`), today’s preorder total vs cap, waitlist count (and optionally last N signups).
- **Write:**
  - Toggle preorder open/closed.
  - Toggle custom orders open/closed.
  - Set daily cap (e.g. $1000 → store 100000).
  - Set status message.
  - **“Open preorder and notify waitlist”** button: set `preorder_open = true`, then run the notification flow (send emails to waitlist).
- **No inventory or product management.** No Shopify-style dashboard. One page, a few toggles and inputs, one button to open and notify.

---

### 1.8 What stays static vs dynamic

| Layer | Static | Dynamic (backend/API) |
|-------|--------|------------------------|
| Site HTML/CSS/JS | ✅ All current pages, assets, styling | — |
| Ordering state | — | ✅ Config and “is preorder open?” (and today total) come from API |
| Waitlist signup | Form UI only | ✅ POST to API, stored in DB |
| Preorder submit | Form UI only | ✅ POST to API, stored in DB, cap check and optional auto-close |
| Custom order submit | Form UI only | ✅ POST to API, stored in DB |
| Admin | Optional static admin HTML | ✅ All reads/writes and “notify waitlist” via API |

- **Frontend change:** Order page (and any global “ordering status” component) no longer read from a static `ordering-config.js`. They call a small API (e.g. `GET /api/ordering-status`) that returns `{ preorderOpen, customOrdersOpen, statusMessage, dailyCapCents?, todayTotalCents? }` so the UI can show open/closed and optionally “we’re at $X of $Y today.”
- **Config file:** Either removed or used only as fallback/initial state; source of truth is the backend.

---

### 1.9 Recommended stack (primary)

- **Hosting / frontend:** Keep static site on Netlify (or current host). Deploy as today; no change to how HTML/CSS/JS are served.
- **Backend:** Netlify Functions (or Vercel serverless) for:
  - `GET /api/ordering-status` — read config + today’s total.
  - `POST /api/waitlist` — add waitlist signup.
  - `POST /api/preorders` — submit preorder (with cap check and optional auto-close).
  - `POST /api/custom-orders` — submit custom order (no cap).
  - `GET /api/admin/config` and `PATCH /api/admin/config` — admin read/update config (and optionally “open and notify”).
- **Database:** Supabase (Postgres) or Turso (SQLite). One DB for `waitlist`, `preorders`, `custom_orders`, and a small `config` table (or key-value row). Supabase gives a simple REST API and real-time if you ever need it; Turso is even lighter.
- **Email:** Resend (or SendGrid/Postmark). One template for “ordering is open”; API key in env; send from admin “open and notify” flow.
- **Admin UI:** One static HTML page under the same site that calls the admin API; protect by secret path (e.g. `/rachel-bakes-gf/admin/?key=...`) or basic auth.

**Why this is lean:** No separate app server, no Kubernetes, no queues for v1 (you can add a queue later if the waitlist is huge). One host (Netlify), one DB (Supabase/Turso), one email provider. All logic in a handful of serverless functions.

---

### 1.10 Fallback stack

- **Backend:** Small Node or Python service on a single VPS or Fly.io, with SQLite or Postgres. Same API shape; admin and “notify waitlist” run inside that service. No serverless; you manage one process and one DB.
- **Tradeoff:** Slightly more ops (deploy, restart, backups) but no vendor lock-in and same simplicity of data model and flows.

---

## PART 2 — Build Path (Concrete Steps)

### 2.1 Data objects / tables

- **config** (single row or key-value)
  - `preorder_open` (boolean), `custom_orders_open` (boolean), `daily_cap_cents` (int), `status_message` (text).
- **waitlist**
  - `id` (pk), `email` (unique), `name` (nullable), `created_at`; optional: `notified_at`.
- **preorders**
  - `id`, `name`, `contact`, `order_summary`, `pickup_date`, `pickup_window`, `notes`, `amount_cents`, `created_at`.
- **custom_orders**
  - Same as today’s custom form fields (name, contact, event_date, etc.); no cap-related fields.

No product catalog table for v1; menu stays static. Order total is a single number supplied at submit time.

---

### 2.2 Order form changes for structured order values

- **Current form:** name, contact, free-text “order”, pickup_date, pickup_window, notes. No amount.
- **Required change:** Add a single **order total** field so the backend can enforce the cap.
  - **Option A (simplest):** Required field “Order total ($)” or “Estimated total” — customer or Rachel fills it when confirming; backend stores it as `amount_cents`. No line-item logic.
  - **Option B:** Frontend has a simple list of items with prices (e.g. from a small JSON or hardcoded menu with prices); form computes and sends `amount_cents` plus optional line items. Slightly more structure, still no full catalog in the DB.
- **Recommendation for lean:** Option A. Add one field (e.g. `order_total_dollars` or `amount_cents`); frontend sends it; backend validates and uses it for cap. Optional: keep free-text “order” for description; backend stores both.

---

### 2.3 Minimum admin controls

- **View:** Preorder open/closed, custom orders open/closed, today’s total ($) vs daily cap ($), waitlist count, current status message.
- **Edit:**
  - Preorder open/closed toggle.
  - Custom orders open/closed toggle.
  - Daily cap in dollars (saved as cents).
  - Status message text.
- **Action:** One button: “Open preorder and notify waitlist” — sets preorder open and sends the “we’re open” email to all (unnotified) waitlist entries.
- **Optional later:** List of today’s preorders; list of recent waitlist signups; “Close preorder” without notifying.

---

### 2.4 Services for notifications

- **Primary:** Resend. Sign up, get API key, create one template (e.g. “Rachel Bakes GF is now taking orders” + link to order page). From the “open and notify” flow, loop over waitlist and call Resend’s API (or batch if needed).
- **Alternative:** SendGrid, Postmark, or AWS SES. Same idea: one template, one send loop triggered by admin action.

---

### 2.5 Static frontend vs dynamic backend (summary)

| Item | Where it lives | Notes |
|------|----------------|--------|
| Site pages (home, menu, order, custom, gallery, about, policies) | Static | Unchanged structure; order/custom forms POST to API |
| Ordering state (open/closed, message, cap) | Backend | Frontend calls `GET /api/ordering-status` on load (and after submit if needed) |
| Waitlist signup | Backend | Form POST to `/api/waitlist`; no mailto |
| Preorder submit | Backend | Form POST to `/api/preorders`; includes `amount_cents`; backend enforces cap and can set preorder_open = false |
| Custom order submit | Backend | Form POST to `/api/custom-orders` |
| Admin UI | Static HTML + API | One page; reads/writes via admin API; “open and notify” calls backend |
| Notify-waitlist emails | Backend | Triggered by admin “open and notify”; uses Resend (or chosen provider) |

---

### 2.6 Implementation order (suggested)

1. **DB + config:** Create Supabase (or Turso) project; add `config`, `waitlist`, `preorders`, `custom_orders`; seed config with current defaults.
2. **Ordering status API:** Implement `GET /api/ordering-status` (read config + today’s total); no auth for this endpoint.
3. **Frontend ordering state:** Replace static `ordering-config.js` with a fetch to `GET /api/ordering-status`; keep same UI behavior (open/closed, message, notify form when closed).
4. **Waitlist API + form:** `POST /api/waitlist`; point notification signup form to it; remove mailto for that form.
5. **Preorder API + form:** Add `amount_cents` (or order total) to order form; implement `POST /api/preorders` with cap check and auto-close; point form to it.
6. **Custom orders API:** `POST /api/custom-orders`; point custom form to it.
7. **Admin API + UI:** Endpoints to read/update config and trigger “open and notify”; minimal admin page that calls them.
8. **Email integration:** In “open and notify,” integrate Resend (or chosen provider) and send to waitlist.

After this, you have a real waitlist, structured preorders with a daily cap, automatic close when cap is reached, and a single admin surface to open/close and notify — without building a full ecommerce app.
