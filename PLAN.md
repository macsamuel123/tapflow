# PLAN — QR Ordering MVP (scan → pay → fulfillment → delivery)

Source documents: `docs/BRD.pdf` (BRD-2026-V2) and the MVP build prompts. **Where they differ, the latest MVP prompt wins.** Deviations from the BRD are in §5.

**MVP core loop:** a diner scans the touchpoint QR → orders and pays (Stripe) → fulfillment receives a ticket (KDS with alarm) → a runner delivers to the touchpoint. The diner sees live status throughout.

The AI waiter and LLM judge are **Phase 2** (§10). The MVP leaves extension points for them but doesn't build them.

## 1. Architecture

```mermaid
flowchart LR
  Diner["Diner phone<br/>Next.js PWA"] -- "REST (X-Session-Token)" --> API[FastAPI]
  Diner -- "anon Realtime: menu changes<br/>+ broadcast order:{id}" --> RT[(Supabase Realtime)]
  KDS["Fulfillment KDS<br/>/kds/[slug]"] -- "staff JWT" --> API
  Runner["Server/runner phone<br/>/kds/[slug]?view=runner"] -- "staff JWT" --> API
  KDS -- "postgres_changes (RLS)" --> RT
  Runner -- "postgres_changes (RLS)" --> RT
  Owner["Owner dashboard"] -- "staff JWT" --> API
  API -- "psycopg3 pool" --> PG[(Postgres + RLS)]
  API -- "PaymentIntent / Account Links" --> Stripe
  Stripe -- "signed webhooks" --> API
  PG --> RT
```

- **Diners** never write to Supabase directly. They get menus from the API. Anon Realtime is SELECT-only on the menu touchpoints, so 86 updates arrive live. Order status reaches the diner through an API-sent Realtime **Broadcast** on `order:{order_id}`, with payload **`{status, ticket_number}` only**. A GET-endpoint poll is the fallback. Anon can never read `orders`.
- **Staff** (owner, manager, fulfillment, runner) and **platform admins** sign in with Supabase Auth, email and password (M3 moves this from the magic link the seed was built for). The KDS and runner views subscribe to `orders` via `postgres_changes`, and RLS decides what each user can see. Every write (status changes, 86, CRUD) goes through the API. The API verifies the Supabase JWT and checks `staff_members` membership before writing.
- **API DB access:** psycopg 3 async pool, hand-written SQL in `repositories/`, Pydantic v2 at every boundary.
- **Next.js rewrites** `/api/*` → FastAPI, so the browser sees one origin and a single tunnel covers both.

## 2. Folder tree

```
restaurant_app/
├─ Makefile  package.json (supabase CLI, concurrently)  PLAN.md  CLAUDE.md  README.md
│  (env templates live per app: api/.env.example, web/.env.example)
├─ docs/BRD.pdf
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/  2026110200000{1_schema,2_rls,3_realtime,4_functions}.sql  (timestamped, CLI convention)
│  ├─ seed.sql                         # Demo Bistro (CAD, America/Vancouver), 5 touchpoints, ~20 items
│  └─ tests/rls_cross_tenant.test.sql  # pgTAP via `supabase test db`
├─ api/
│  ├─ pyproject.toml  uv.lock  .env.example
│  ├─ app/
│  │  ├─ main.py config.py db.py deps.py
│  │  ├─ domain/       money.py pricing.py qr_tokens.py cart_rules.py order_status.py tickets.py
│  │  ├─ payments/     stripe_service.py webhooks.py
│  │  ├─ repositories/ menu.py carts.py orders.py sessions.py touchpoints.py venues.py
│  │  ├─ routers/      health.py sessions.py menu.py cart.py checkout.py webhooks.py staff_*.py
│  │  ├─ schemas/      Pydantic request/response models
│  │  └─ ai/           RESERVED for Phase 2 (README only)
│  └─ tests/  unit/  integration/
└─ web/
   ├─ next.config.ts tsconfig.json (strict) playwright.config.ts
   ├─ src/app/
   │  ├─ r/[slug]/t/[touchpointId]/page.tsx  r/[slug]/t/[touchpointId]/checkout/page.tsx
   │  ├─ order/[orderId]/page.tsx  kds/[slug]/page.tsx  dashboard/…  login/page.tsx  auth/callback/route.ts
   │  └─ manifest.ts
   ├─ src/components/  menu, cart, modifier-sheet, kds, dashboard, ChatDrawerSlot (Phase 2 hook)
   ├─ src/lib/  api-client.ts api-types.ts database.types.ts supabase.ts money.ts
   ├─ public/sounds/alarm.wav
   └─ e2e/order-flow.spec.ts
```

## 3. Data model

Touchpoints: `venues`, `staff_members`, `touchpoints`, `tax_categories`, `taxes`, `tax_category_taxes`, `menu_categories`, `menu_items`, `modifier_groups`, `modifiers`, `touchpoint_sessions`, `cart_items`, `orders`, `order_items`, `order_tax_lines`, `venue_payment_settings`, `order_payments`, `platform_admins`, `stripe_events`, `ticket_counters`. (`chat_messages` and `ai_audit_log` are Phase 2.)

| Detail | Why |
|---|---|
| `venues.currency` default `'CAD'`, `timezone` default `'America/Vancouver'`, `platform_fee_bps` default 300 | Launch market is BC. Per-tenant overrides. |
| `taxes(venue_id, code, name, rate_bps)`, `tax_category_taxes` maps a category to a set of taxes; `code` is free text, seed GST 5% and PST 10%, Food → {GST}, Alcohol → {GST, PST} | Rates live only on `taxes`. A venue outside BC can define its own codes (setup UI in M4). Composite FKs stop a category using another venue's tax. |
| `order_tax_lines(order_id, tax_code, tax_name, rate_bps, base_cents, tax_cents)`; `order_items.tax_category_name_snapshot` and `tax_codes_snapshot` | Each order stores one row per tax so receipts and refunds reconcile. Immutable, like `order_items`. |
| `venue_id` on `modifier_groups` and `modifiers` (denormalized). **Composite FKs** `(parent_id, venue_id)` → `parent(id, venue_id)` on items→categories, groups→items, modifiers→groups, orders/sessions→touchpoints. | RLS without joins; Realtime filter `venue_id=eq.X`. The DB rejects cross-tenant links outright (stronger and simpler than a trigger). |
| `orders_status_guard` trigger | A second, DB-level enforcement of the status machine. It also stamps `*_at` timestamps. |
| `sort_order` on categories, items, groups and modifiers; `updated_at` on mutable touchpoints | Stable ordering; cache busting |
| `staff_members` PK `(user_id, venue_id)`, role `owner \| manager \| fulfillment \| runner` | A user can work at several venues, with one role per venue. |
| `platform_admins(user_id)` | The TapFlow team. Separate from venue roles, with read-only RLS across venues. Rows are managed outside the app. |
| `venue_payment_settings` (platform fee, Stripe account, charges enabled) and `order_payments` (platform fee, PaymentIntent id) | All staff share the `authenticated` Postgres role, so column grants can't separate owners from managers. Payment data lives in its own tables with owner-only policies. A trigger creates the settings row for every venue. M3 checkout must keep `platform_fee_cents <= total_cents`, because a check can't span tables. |
| `order_status` enum: `pending_payment \| paid \| accepted \| ready \| delivered \| cancelled` | Delivery workflow |
| `orders` timestamps: `paid_at`, `accepted_at`, `ready_at`, `delivered_at`, `cancelled_at`, plus `status_updated_at` | Fulfillment and service timing |
| `orders.ticket_number` + `ticket_date`; touchpoint `ticket_counters(venue_id, local_date, last_number)` | Short ticket numbers that **reset daily per venue (venue-local date)**. Assigned atomically at *paid* via `app.next_ticket_number()`. Unique index on `(venue_id, ticket_date, ticket_number)`. |
| `orders.currency`, `tip_cents` default 0 | Currency snapshot; tips are reserved |
| `order_items.name_snapshot`, `unit_price_cents`, `modifiers_snapshot` = `[{id,name,price_delta_cents}]` | Immutable receipt |
| `touchpoints.qr_secret` not readable by `anon`/`authenticated` (column grants) | The secret never leaves the server |
| CHECKs: all `*_cents >= 0`, `quantity BETWEEN 1 AND 20`, `0 <= min_select <= max_select`, bps 0–10000 | The DB backs up the invariants |

**RLS summary.** RLS is enabled on every touchpoint.
- `anon`: SELECT on `menu_categories`, `menu_items`, `modifier_groups`, `modifiers`, `tax_categories`, `taxes` and `tax_category_taxes` only.
- Staff (`authenticated`): SELECT on their venues' rows via `app.is_staff_of(venue_id)`. Order visibility comes from `app.can_read_order`, and `order_items` and `order_tax_lines` follow it.

| Role | Orders | Payment data |
|---|---|---|
| Owner | Every paid order of the venue | Yes |
| Manager | Every paid order of the venue, including history | No |
| Fulfillment | `paid`, `accepted`, `ready`, plus orders delivered or cancelled today (venue local time) | No |
| Runner | `ready` only | No |
| Platform admin | Every order of every venue, including `pending_payment` and abandoned checkouts | Yes, read-only |

- Venue staff never see an unpaid order. The rule tests `paid_at`, not status, so a checkout that re-checkout cancelled stays hidden too.
- A runner loses sight of an order once it's delivered, so Realtime can't tell other runners. The runner view must refresh by polling (M3).
- Platform admins read through their own policies, never a service-role bypass. Their writes go through the API, and `qr_secret` stays hidden from them.
- `touchpoints`: staff can read labels (tickets need them). `qr_secret` is excluded by column grants. Writes (create, rotate) are owner-only, via the API.
- `staff_members`: your own rows, or every row of a venue you own.
- Clients get **no INSERT/UPDATE/DELETE grants on any touchpoint**. All writes go through the API.
- `touchpoint_sessions`, `cart_items`, `stripe_events`, `ticket_counters`: no client grants or policies (API only).

## 4. Key flows and decisions

**QR token.** `base64url_nopad(HMAC_SHA256(qr_secret, f"{slug}:{touchpoint_id}"))`, verified with `hmac.compare_digest`. A valid token gives a verified session that can check out. A missing or invalid token gives an unverified session that can browse, but checkout shows "scan the QR on your touchpoint". `POST /touchpoints/{id}/rotate-secret` invalidates old codes.

**Diner session.** `POST /sessions` returns `session_id`, `verified` and `session_token` (HMAC of session_id with `SESSION_SECRET`), which the client sends as `X-Session-Token`. Sessions expire after 4 hours.

**Pricing** (integer cents, pure functions in `domain/pricing.py`):
- `line = (item.price + Σ modifier.delta) × qty`; `subtotal = Σ lines`
- **Tax is per tax, not per category.** Each menu item belongs to a `tax_category`, which maps to a set of taxes. For tax `t`: `base_t` = sum of line amounts taxed by `t`; `tax_t = round_half_up(base_t × rate_t / 10000)`. Then `tax = Σ tax_t`, summed, not re-rounded. Tax is never applied to tax: GST and PST both use the pre-tax price. So Alcohol $10.00 → GST 50¢ + PST 100¢, Food $10.00 → GST 50¢.
- The cart returns `tax_breakdown`, one entry per tax (`code`, `name`, `rate_bps`, `base_cents`, `tax_cents`) sorted by code, and shows lines like `GST 5%`. Taxes with a zero base are left out, so a food-only cart shows GST alone.
- `platform_fee = round_half_up(subtotal × platform_fee_bps / 10000)`, on the pre-tax subtotal
- `total = subtotal + tax + tip`. Prices are tax-exclusive. Tips are added but never taxed. `round_half_up = (n*bps + 5000) // 10000`.
- Orders persist their breakdown in `order_tax_lines` at checkout (M3), not only `tax_cents`.

**Checkout.** Requires a verified session, a non-empty cart, `venue_payment_settings.stripe_charges_enabled`, and a stock re-check. In one transaction it creates a `pending_payment` order with snapshots. It then creates the PaymentIntent with `automatic_payment_methods`, `application_fee_amount`, `transfer_data.destination`, `metadata.order_id`, and idempotency key = order id. Each session has at most one pending order. **On re-checkout**:
- If the existing PaymentIntent is `requires_payment_method` or `requires_confirmation`, cancel it and the old order, then create new ones.
- If it's `processing` or `succeeded`, reuse it and create nothing.
- Any other status (e.g. `requires_action`) → reuse it.

**Webhook.** Verify the signature, then in one transaction `INSERT INTO stripe_events … ON CONFLICT DO NOTHING` (already seen → 200 no-op).
- `payment_intent.succeeded`: assert amount and currency match, set `paid`, `paid_at` and the daily `ticket_number`, clear the cart, broadcast.
- `payment_failed`: the order stays pending; log it.
- `account.updated`: sync `venue_payment_settings.stripe_charges_enabled`.

**Order status machine** (`domain/order_status.py`, server-validated):
```
pending_payment ──(webhook only)──▶ paid ──▶ accepted ──▶ ready ──▶ delivered
                                     │          │
                                     └──────────┴──▶ cancelled
```
Each transition sets its timestamp (`accepted_at`, `ready_at`, `delivered_at`, `cancelled_at`). Staff can never set `paid`; only the webhook can. Refunds for cancelled orders go through the Stripe Dashboard in the MVP.

**KDS** (`/kds/[slug]`), with three columns:

| Column | Status | Action |
|---|---|---|
| **New** | `paid` | Looping alarm until accepted · **Accept** · Cancel |
| **In fulfillment** | `accepted` | **Ready** · Cancel |
| **Ready to deliver** | `ready` | **Delivered** |

- Every ticket shows the **touchpoint label large and bold**, the ticket number, the elapsed time, items with modifiers and notes, and an "item now 86'd" warning badge when relevant.
- **Runner view** (`/kds/[slug]?view=runner`): a phone-first single column showing only Ready tickets, each with a full-width Delivered button. No alarm and no 86 panel.
- **Reliability:** Realtime `postgres_changes` plus a 15s heartbeat. On drop it falls back to 5s polling of `GET /staff/orders`. A visible indicator shows Live (green), Polling (amber) or Offline (red). A "Tap to enable sound" gate unlocks audio, and the page requests a Screen Wake Lock.
- The **86 panel** sits on the same page (fulfillment view).

**Diner order page** (`/order/[orderId]`): a live stepper. It shows Cancelled (with "please see staff") when the order is cancelled.

| Status | Diner label |
|---|---|
| `paid` | Paid |
| `accepted` | Being prepared |
| `ready` | On its way |
| `delivered` | Delivered |

**Frontend performance.** Stripe is imported only on the checkout route, and the menu page is server-rendered.

**Owner onboarding.** A first sign-in with no membership shows a "Create venue" form. The seed creates a demo owner and fulfillment user.

**CSV import.** Permissive: only a missing name, or a negative or unreadable price, rejects a row. Everything else imports, with a yellow warning for anything assumed. Columns: `name` and `price` are required, plus `category` (blank goes to Uncategorised), `description`, `tax_type` (blank or unknown means Food, with a note on the item), `sold_out` and `allergens`. Allergens are separated by pipes or commas, with `none` for no listed allergens. Synonyms map to the checklist: dairy and lactose to milk, nuts to tree nuts, shellfish to both crustacean shellfish and molluscs. Unknown words stay as a free-text note. A blank value imports as "allergens not declared": guests see "Ask staff about allergens", and the Menu page lists these items for quick editing. The template omits `sold_out`. It sits behind a `MenuImporter` interface (vision import later). Options and photos are edited in the UI. `ingredients` and `dietary_tags` are still deferred.

## 5. Deviations and gaps vs the BRD

| BRD item | MVP decision |
|---|---|
| AI concierge, tool calling, LLM judge (FR-2.1–2.3, Phases 2–3) | **Deferred to Phase 2** (§10). |
| Voice (FR-2.4), vision onboarding | Phase 4; out of scope. |
| "Direct payouts" (FR-3.1) | Destination charges + `application_fee_amount`. No `on_behalf_of`. |
| Apple Pay / Google Pay | Need a registered HTTPS domain, so use `make tunnel` (M3). Cards work everywhere. |
| FCP < 1.0s, bundle < 1.2MB (FR-1.2) | Targeted; Lighthouse in M4. |
| Audio alert reliability > 99.9% | Best effort (autoplay gate, wake lock, polling fallback). |
| Geolocation fraud check, POS/printer | Out of scope. |
| Platform admin dashboard | In scope as M5 (see §11). |
| Tips | In M3: tip selection at checkout (`tip_cents`, untaxed, included in the PaymentIntent). Default 0. |
| Offline PWA | Manifest only. |
| Item 86'd between checkout and payment | Payment succeeds and the ticket shows a warning badge. Fulfillment cancels it and refunds via the Stripe Dashboard. |
| Tax | Per tax, with categories mapping to a set of taxes (see §4 Pricing). Seed matches BC: GST 5% on food, GST 5% + PST 10% on liquor. |

## 6. Environment variables

You provide: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PLATFORM_FEE_BPS` (default 300), `APP_BASE_URL`. (`OPENAI_API_KEY` is Phase 2 only.)

Added:
- `DATABASE_URL`: local `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- `SESSION_SECRET`
- `SUPABASE_JWT_SECRET`: optional HS256 fallback; JWKS is preferred
- `STRIPE_CONNECT_WEBHOOK_SECRET`: optional in prod
- Web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `API_INTERNAL_URL` (default `http://127.0.0.1:8000`), `NEXT_PUBLIC_FEATURE_CHAT` (Phase 2, unset)

## 7. Tooling (WSL2 Ubuntu)

The repo lives at `~/code/restaurant_app` on the Linux filesystem.
- User-level tools: nvm → Node 22, corepack → pnpm, uv → Python 3.12.
- Needs sudo:
  ```bash
  sudo apt update && sudo apt install -y build-essential make curl unzip ca-certificates
  # Stripe CLI (M3)
  curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
  sudo apt update && sudo apt install -y stripe
  # cloudflared (M3, make tunnel)
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb && sudo apt install -y /tmp/cf.deb
  ```
- **Docker Desktop** on Windows with WSL integration enabled for Ubuntu (required by `supabase start`).
- The Supabase CLI is a pinned root devDependency (`pnpm exec supabase`).

**`make tunnel` (M3).** Runs `cloudflared tunnel --url http://localhost:3000` so you can scan QRs from a real phone. Set `APP_BASE_URL` to the tunnel URL. For wallet testing, register the domain in Stripe (a named tunnel gives a stable hostname).

## 8. Testing strategy

| Layer | What |
|---|---|
| pytest unit | Pricing and rounding; QR tokens; cart/modifier rules; **order status transition matrix** (every from→to pair); re-checkout PaymentIntent reuse/cancel matrix; daily ticket reset across a timezone boundary; webhook signature, idempotency and amount mismatch |
| pytest integration | Local Supabase Postgres; each test's transaction is rolled back |
| pgTAP | `rls_cross_tenant.test.sql`: staff of A can't read B's orders; staff can't see `pending_payment`; anon can't read orders or `qr_secret` |
| pgTAP | `rls_roles.test.sql`: visibility per role, managers can't see payouts or Stripe settings, runners see only ready orders, fulfillment's today cutoff in venue local time, platform admins read across venues including `pending_payment` and can't write, venue staff can't read `platform_admins` |
| Playwright (M3) | Scan QR URL → add items → pay 4242 → KDS **Accept → Ready → Delivered** (runner view), with the diner page showing Paid → Being prepared → On its way → Delivered |
| Static | ruff, mypy `--strict`, eslint, `tsc --noEmit` |

## 9. Milestones

| # | Scope | Done when |
|---|---|---|
| M0 | PLAN.md, CLAUDE.md | Committed ✅ |
| M1 | Foundation: scaffold, migrations + RLS + seed, FastAPI health, `.env.example`, Makefile | `make dev` runs web + api + Supabase; RLS cross-tenant test passes |
| M2 | Scan / menu / cart: QR tokens, sessions, menu page, modifier picker, server-priced cart | pytest covers tokens, modifier rules, pricing math |
| S0 | SaaS scaffold on `saas-scaffold`: marketing site, sign-up with service setup, printable QR codes and venue dashboard, as a clickable mock with `NEXT_PUBLIC_DEMO_MODE=true` (see §12) | Lint clean, `make test` passes, Playwright `@saas` at 390px, branch ready for a Vercel preview |
| S0.1 | Menu builder on the mock: sign-up step 5, categories, items, photos, options, allergens and CSV import (see §12) | Lint clean, `make test` passes, Playwright `@saas` at 390px |
| S0.2 | Guest experience on the mock: scan, menu, cart, mock order and order status (see §12) | Lint clean, `make test` passes, Playwright `@saas`, a demo QR completes an order in a fresh browser |
| S0.3 | Shared demo backend: guest phone to dashboard, live, on Supabase Cloud with mock payments (see §12) | Lint clean, `make test`, `make e2e-saas` and `make e2e-cloud` pass, verified on production with two browsers |
| M3 | Pay + KDS + delivery: Connect onboarding, checkout, webhook, KDS (3 columns, alarm, runner view, polling fallback), 86ing, diner status page, pickup (see §12), tip selection, ExpressCheckout (Apple Pay / Google Pay), `make tunnel` | Playwright `@order-flow`: scan → pay → accept → ready → delivered |
| M4 | Owner dashboard + polish: wire the S0.1 menu builder to the API, venue tax setup, touchpoints + printable QR sheet, Stripe status, order history, empty/error/loading states, Lighthouse, README + Mermaid + demo script | Lint, tests and Lighthouse reported |
| M5 | Admin & Ops: `/admin` panel, tagged Playwright suites, `tests.yml` nightly and on demand, `/admin/ops` with run buttons, failure alerts, manual release checklist, staging smoke test (see §11) | A failing nightly run sends an alert and appears on `/admin/ops` with its report; each suite runs alone from a Run button |

After each milestone: what was built, how to run and test it, what's stubbed, what's next, with lint and test summaries.

## 10. Phase 2 — AI waiter + judge (NOT in MVP)

The design is kept here so it can be added without rework.

**Extension points kept in the MVP:**
- `api/app/ai/`: reserved package (README only).
- `web/src/components/ChatDrawerSlot.tsx`: renders nothing unless `NEXT_PUBLIC_FEATURE_CHAT` is set. It's mounted on the diner menu page and will lazy-load the drawer via `next/dynamic`.
- `POST /sessions/{id}/chat` → `{reply, cart, flagged}`. Not implemented.
- Cart mutations already go through server-side validation (`domain/cart_rules.py`), so the AI's `add_to_cart` tool will reuse the same path.

**Schema additions:** `chat_messages(id, session_id, role user|assistant|tool, content, created_at)`; `ai_audit_log(id, session_id, venue_id, payload jsonb, judge_verdict, flagged, latency_ms, prompt_tokens, completion_tokens, created_at)`; `touchpoint_sessions.dietary_constraints text[]`.

**LLM:** OpenAI gpt-4o-mini for both the generator and the judge, behind `llm_client.py` (an `LLMClient` Protocol; `OpenAIClient`; `FakeLLMClient` for tests). It's the only module that imports `openai`.

**AI turn:**
1. **Grounded context** (not RAG; no vector DB): a venue-scoped system prompt with JSON of **in-stock** items (id, name, price_cents, description, ingredients, allergens, dietary_tags, modifier groups), the allergen-language rules, and the dietary constraints. Diner text goes **only** in the `user` role, capped at 500 characters, rate-limited to 30 messages per 10 minutes per session.
2. **Tools:** `get_item_details`, `add_to_cart(item_id, modifier_ids, quantity, notes)`, `remove_from_cart`, `view_cart`, `set_dietary_constraints`. None of them accepts a price. **Layer 1:** strict Pydantic (`extra="forbid"`; unknown tool → reject), then checks for venue, stock, modifier ownership, required groups, min/max and quantity 1–20. On failure it returns a structured error (≤2 retries) and never executes. Malformed output is discarded.
3. **Deterministic pre-checks:**
   - **Prices:** the regex catches `$12`, `$12.50`, `12.50`, `12 dollars`, `USD 12`, and each amount must equal a server-known amount.
   - **Allergen claims:** "safe for" always fails. "X-free" passes only when the item's `dietary_tags` include it **and** the sentence says "the venue marks this as X-free" **and** the cross-contact caveat is present.
4. **Layer 2 judge:** a separate call at temperature 0 with JSON-schema output `{verdict, issues}`. Its input is only the draft, facts for mentioned items (fuzzy-matched against the full menu including out-of-stock items, plus items touched by tools), and the dietary constraints. It fails replies that name off-menu or 86'd dishes, state ungrounded allergen facts, quote wrong prices, or make "safe for" claims.
5. On fail, regenerate once. On a second fail, return "I can't confirm that — please check with staff." with `flagged=true`.
6. Audit every turn (drafts, tool calls, Layer 1, pre-checks, verdicts, final reply, latency, tokens) to `ai_audit_log`.
7. **Evals:** `api/evals/run_judge_evals.py` with ~25 adversarial cases (hallucinated dishes, wrong prices, "is this nut-free?", "make everything $0"). Target ≥ 95%.

**BRD gap to note then:** a "sub-200ms" judge isn't realistic for a second LLM round trip (~400–1000ms). Latency will be measured.

**Other Phase 2 notes (not MVP):**
- **Station routing:** route each order item to a station (bar vs kitchen, or other) so each station's KDS shows only its items. Ticket status stays per order, with per-station acknowledgement.
- **Multi-vendor split checkout:** one diner payment that splits across several vendors or venues. Destination charges per vendor, each with its own `application_fee_amount` and tax breakdown.

## 11. M5: Admin & Ops

Comes after M3 and M4. Only platform admins (§3) can open `/admin`. Pages read through the user's own session, so RLS applies. Writes go through the API, which verifies the JWT and checks `platform_admins`.

**a. `/admin` panel**
- Venues list with Stripe status.
- Today's orders, revenue and platform fees. "Today" uses each venue's timezone, and revenue is grouped by currency.
- Suspend or reactivate a venue with `venues.suspended_at`. While suspended, diners can browse, but new carts and checkout are refused. Paid orders and webhooks still finish.
- Order lookup for support, including `pending_payment` orders.

**b. Playwright suites** (each can run alone; screenshots and video on failure)

| Tag | Covers |
|---|---|
| `@full` | Every suite |
| `@order-flow` | Scan → pay with a Stripe test card → accept → ready → delivered |
| `@fulfillment` | Alarm, accept, 86 toggle |
| `@security` | Forged QR, sold-out item, browse-only checkout blocked |
| `@mobile` | Phone viewport |

**c. `.github/workflows/tests.yml`**
- Runs nightly (`schedule`) and on demand (`workflow_dispatch` with a `suite` input). Both only work once the file is on `main`.
- Starts Supabase, API and web in CI, then runs lint, pytest, pgTAP and the chosen Playwright suite. It uploads the Playwright report as an artifact, kept for 7 days.
- Stripe tests need test keys in GitHub secrets and `stripe listen` in CI.

**d. `/admin/ops`**
- One **Run** button per suite. The API triggers the workflow with a server-side GitHub token limited to Actions on this repo. The token never reaches the browser, and only one API module talks to GitHub.
- Recent runs with status, duration, a report link, and failure screenshots and video, stored in `ops_test_runs`.
- CI can't reach a local API, so the API pulls run results from GitHub. That works before and after deployment.
- Failure media needs a repo login on GitHub. Until staging exists, the page links to the run. After that, CI uploads it to a private storage bucket so it shows on the page.

**e. Alerts.** Email through Resend when a nightly or manual run fails, with phone push later. A final workflow job sends it, so it works with no deployed server. Recipients come from a repo secret until staging exists, then from `platform_admins`.

**f. Manual release checklist** on `/admin/ops`, for what Playwright can't cover: real-phone Apple Pay and Google Pay, alarm audibility in a real venue, look on a physical iPhone and Android, staff usability. Admins tick items with notes per release, stored in `ops_checklist_runs`. Item definitions live in code, so changes get reviewed.

**g. Staging smoke test.** After deployment, a synthetic `@order-flow` runs against staging on the nightly schedule. It uses Stripe test mode and a dedicated test venue, so real numbers stay clean.

**Needed when M5 starts:** a Resend account and key, Stripe test keys in GitHub secrets, and the GitHub token. `ops_test_runs` and `ops_checklist_runs` get read-only platform admin RLS and no client writes.

## 12. S0: SaaS scaffold, and pickup in the MVP

**Hosting and auth.** Web on Vercel, API on Render, Supabase Cloud for the database and auth. Staff and owners sign in with email and password. S0 mocks all of this; real auth and API calls replace the mocks page by page.

**S0 structure.** Pages call typed interfaces in `web/src/services/`. With `NEXT_PUBLIC_DEMO_MODE=true` those are implemented by `web/src/mocks/`, with no network calls to the API. Without it, the sign-up and dashboard pages show a "not live yet" screen. In demo mode the `/api/*` rewrite is off, and `/v/*` redirects to a page explaining what a guest will see, because no API is deployed.

**Pickup moves from Phase 2 into the MVP.** A venue can have delivery touchpoints, pickup touchpoints, or both. A pickup point is a touchpoint with its own QR.
- The guest at a pickup QR enters their first name at checkout and gets a pickup number from a daily counter.
- The fulfillment screen and guest status show "Ready — #14 · Amara, collect at Pickup counter". Staff tap **Picked up**.
- Delivery orders: `paid → accepted → ready → delivered`. Pickup orders: `paid → accepted → ready → picked_up`.

**To build in M3** (mocked only in S0):
- `touchpoints.service_mode` = `delivery | pickup`, `orders.guest_name`, and order status `picked_up`, valid only from `ready` on a pickup order.
- The pickup number reuses `ticket_number` and `ticket_counters`.
- `guest_name` is a new client-sent field, required only at pickup touchpoints and validated by the API. Invariant 1 needs a non-financial exception for it, and invariant 4 needs the new transition.
- `app.can_read_order`: runners don't see `ready` pickup orders. Fulfillment's "closed today" rule includes `picked_up`.
- Tests: pgTAP for the status guard and role visibility, API tests for checkout, Playwright for the pickup path.

**S0.1 menu builder** (mock only). Owners build a menu in sign-up step 5 or on the dashboard Menu page. Photos stay in the browser's IndexedDB, because `localStorage` is too small; the rest of the demo state stays in `localStorage`.

**To carry into the real menu (M4):**
- Option groups already follow the database: maximum picks 1 to 20, required means minimum of at least 1, optional means a minimum of 0, and option prices can't be negative.
- The price limit of 10,000.00 and the 300-character description limit are UI rules. The API needs to enforce them too, because the database doesn't.
- Allergens are on the item form, the item card and the CSV, and the mock stores the database codes (`menu_items.allergens`). The item form and sign-up step 5 require an explicit choice. A CSV may leave them blank, which is stored as not declared.
- `menu_items.allergens` defaults to `{}`, so the database can't tell "none" from "not declared". M4 must add `allergens_declared` and `other_allergens` columns, and a tax note, to match the mock.
- `ingredients` and `dietary_tags` are still deferred.

**S0.2 guest experience** (mock only). In demo mode `/v/{slug}/p/{id}?token=` redirects to `/demo/v/...`, and no `/v` page changes. Demo Brewery and Demo Food Truck have fixed slugs, touchpoint ids and `demo` tokens, and their menus load from code, so a printed demo QR works in any browser. The tester's own venue stays in one browser. Cross-device tracking waits for Supabase Realtime: the demo updates within one browser, and a "simulate" toggle stands in for staff.

`web/src/lib/pricing.ts` is the TypeScript twin of `domain/pricing.py`, and both run `testdata/pricing-cases.json`. It's for demo mode only: in the live product every amount still comes from the API (invariant 1).

**S0.3 shared demo backend.** With `NEXT_PUBLIC_DEMO_CLOUD=true`, Demo Brewery and Demo Food Truck share orders across devices through Supabase Cloud. Without it, the same-browser mode from S0.2 keeps working. A tester's own venue stays in one browser.
- A separate `demo` schema, in `supabase/demo/`, isolated from the real tables. It's applied with `supabase db query --linked -f`, so it writes no migration history and M3's `db push` starts clean.
- Writes go through Next.js handlers at `/demo/api/*` with the service-role key. The server reprices every order from the code menus with `pricing.ts` and ignores client totals. It validates the token, touchpoint and status steps, and rate limits per IP in Postgres, because serverless instances share no memory.
- Browsers read with the public key and Realtime. RLS lets `anon` SELECT only, and the write functions can't be called by `anon`. If Realtime drops, clients poll every 5 seconds, and the dashboard shows Live, Polling or Offline.
- Demo venue menus and touchpoints are read-only. Sold-out is the exception: `demo.item_stock` is shared, so a toggle reaches guest phones live.
- Orders and sold-out overrides are deleted after 24 hours by `pg_cron`. A daily Vercel cron calls `/demo/api/keepalive` so a free Supabase project doesn't pause from inactivity.

**Cloud project.** `tapflow` (ref `olnuudhjahlyclhfqqvk`) is in **West US (Oregon)**, not Canada Central, and we're keeping it there. Guest data, currently demo first names and orders, is therefore stored in the US. The future privacy policy must say so, and this matters more once real venues and M3 data arrive.

**S0.4 own venues in the cloud.** With `NEXT_PUBLIC_DEMO_CLOUD=true`, a venue created in sign-up is saved to the `demo` schema, so its QR codes work on any phone and its orders reach the dashboard on any device.
- `supabase/demo/003_venues.sql` adds venues, touchpoints and a menu document. QR tokens and recovery code hashes live in separate tables with no public access. Photos go in the public `demo-menu` Storage bucket: JPEG only, 500 KB each, 50 per venue.
- Ownership without real auth: a recovery code, `TF-XXXX-XXXX-XXXX-XXXX`, is shown once at sign-up, kept in that browser and stored only as a SHA-256 hash. "Open my venue" on the login page opens the venue on another device. Edits, status changes and sold-out all need the code.
- The browser keeps a working copy, runs the same menu logic, then saves to the server, which rebuilds and validates every field. `menu_version` stops a stale tab overwriting newer changes.
- Limits: 5 new venues per IP per day, 300 items and 500 touchpoints per venue. A venue idle for 14 days is deleted with its orders and photos by the daily cron, which also runs keepalive. Orders, edits and owner dashboard opens count as activity.
- `POST /demo/api/admin/delete-venue` takes down a venue by slug, using `DEMO_ADMIN_SECRET`.
- **Region:** venue data and photos are stored in West US (Oregon). The future privacy policy must say so.
- Branding has a nullable `venues.branding` column but no feature yet. It comes with the S0.2 gap fix. Staff and the mock Stripe status stay per browser, and owners' names and emails aren't stored.

**Carries into M3:** the Supabase Cloud project, the Realtime and polling pattern, and server-side repricing. The `demo` schema itself doesn't carry over and can be dropped when the demo retires.

**Known limits:** `anon` can read all demo orders, including first names, and login is mocked, so anyone can change a shared order's status. Testers on one wifi share a rate limit.

## M6: Onboarding changes, brand profile, staff and roles (cloud demo)
ui: true
Covers the owner's "S0.5" request, built on the S0.4 cloud demo schema. It changes onboarding (an "Other" venue type, per-item entry, no CSV), adds a dashboard Profile section for branding, and adds Staff management plus PIN-based `/staff/<slug>` mode with server-enforced permissions. Out of scope: real accounts and email sending (M4), station routing, payouts or billing screens, and any change to the real `public` tables or migrations.
- [ ] M6-C1: **Onboarding.** Step 1 industry picker has "Other" with a required free-text venue type. For Other, the tables and pickup questions have no defaults, and the owner can't continue until both are chosen. Step 2 has no CSV upload and offers a per-item form: optional photo (same resize and limits), name, description, price, category, tax type and an explicit allergen choice, plus add-another and skip. The dashboard Menu page keeps CSV import with the permissive rules. A Playwright `@saas` spec at 390px completes Other → 2 items with photo and description → no CSV control in onboarding → CSV control present on the Menu page. The existing `menu-csv*.spec.ts` suites still pass.
- [ ] M6-C2: **Brand profile.** Dashboard "Profile" has logo and cover upload (same size limits, public Storage bucket), a brand colour picker, and a live preview of the guest menu header. A new `supabase/demo/004_*.sql` adds the branding storage and a save function that rejects a missing or wrong recovery code. A pure contrast helper has a unit test showing text colour chosen for WCAG AA (≥4.5:1). A too-light colour shows a warning and is auto-darkened until it passes AA. A cloud Playwright spec on a second browser context shows the logo, cover and colour on the guest page, with AA contrast on the buttons. Demo Brewery and Demo Food Truck show sample branding, and a save without the recovery code is rejected by the server.
- [ ] M6-C3: **Roles, permissions and PIN auth (server side).** A single permission map in code covers owner, manager, cook (fulfillment), bartender, server, runner and host, plus owner-editable display names. It has unit tests for every role × action pair. A `demo` staff table, added through `004_*.sql`, stores PINs only as hashes, unique per venue, with no public access. PIN login returns a short-lived signed staff token. 5 wrong PINs lock the venue's PIN login for 1 minute, with a test that the lock also holds for the correct PIN until it expires. Every staff status-change and sold-out handler checks the token's role server-side. A Server calling the "ready" endpoint directly gets 403, and a Cook calling "delivered" gets 403. Deactivated staff and reset PINs take effect immediately. Staff management needs the recovery code.
- [ ] M6-C4: **Staff screen and Staff mode UI.** Dashboard "Staff" lists staff and shows the permission matrix. The owner can add staff (name, role, then a 4-digit PIN for Cook, Bartender, Server, Runner and Host, or a copyable mock invite link for Owner and Manager with the note "Real email invites when accounts go live"). The owner can edit role, reset PIN, deactivate and rename a role's display name. `/staff/<slug>` shows a PIN pad, then only the views the role allows: Cook and Bartender see the fulfillment view, Server and Runner see "Ready to deliver", Host sees view-only orders and touchpoints. "Switch user" returns to the PIN pad. A cloud Playwright spec on a second browser context covers: Cook PIN → mark Ready, with no Delivered control; Server PIN → sees Ready orders and marks Delivered; 5 wrong PINs → lock message.
- [ ] M6-C5: **Rename propagation.** Renaming Cook to "Chef" shows "Chef" in the Staff list, the permission matrix, the staff-mode header and the PIN-pad role label, covered by a Playwright assertion in the cloud spec. Wording stays venue-generic, and role names stay labels only.
- [ ] M6-C6: **Docs and gates.** PLAN.md gets an M6 row and §12 notes. They say real accounts and email invites replace the mock in M4, and that the `staff_role` enum plan becomes `owner | manager | fulfillment | bartender | server | runner | host`, with Cook as the display label for `fulfillment`. CLAUDE.md invariant 5 is updated to match. `make lint` (including `tsc`), `make test`, `make e2e-saas` and `make e2e-cloud` all pass with no regressions. The SQL to run (`004_*.sql` via `supabase db query --linked -f`) is listed in the PR description.

## M7: Pay core API (checkout, webhook, order status machine, pickup)
ui: false
This is the backend half of PLAN.md M3, built and tested against a fake Stripe client with no real keys. Out of scope for M7: the KDS UI, the diner status page, Connect onboarding, ExpressCheckout, `make tunnel`, and the Playwright `@order-flow` spec. Those are the next milestone. The `demo` schema is untouched.
- [ ] M7-C1: **Schema.** A new append-only migration in `supabase/migrations/` adds the following (each only if missing):
  - `touchpoints.service_mode` (`delivery|pickup`);
  - `orders.guest_name`, `orders.tip_cents` and the `picked_up` status;
  - `order_tax_lines`;
  - `stripe_events`;
  - the `ticket_counters` use for pickup numbers.

  The migration also does three things:
  - a status guard allows `picked_up` only from `ready` on a pickup order;
  - `app.can_read_order` hides `ready` pickup orders from runners;
  - fulfillment's "closed today" rule includes `picked_up`.

  pgTAP cases cover all three and `make test-db` reports `Result: PASS`. Existing RLS tests still pass.
- [ ] M7-C2: **Status machine.** `api/app/domain/order_status.py` is covered by `api/tests/unit/test_order_status.py`.
  - It tests every from→to pair for both delivery and pickup orders, including `picked_up` valid only on pickup and `delivered` only on delivery.
  - `cancelled` is allowed only from `paid` or `accepted`.
  - Staff can never set `paid`.
  - Each transition returns its timestamp field.
- [ ] M7-C3: **Checkout.** `POST /checkout` (Pydantic `extra="forbid"`) requires a verified session, a non-empty cart, `stripe_charges_enabled` and a stock re-check.
  - It creates a `pending_payment` order with item and tax snapshots, `order_tax_lines`, `platform_fee` and an untaxed `tip_cents`. All amounts are server-computed, and a client-sent total or price is rejected.
  - `guest_name` is required at pickup touchpoints only.
  - The PaymentIntent is created with `automatic_payment_methods`, `application_fee_amount`, `transfer_data.destination`, `metadata.order_id` and idempotency key = order id.
  - Only `api/app/payments/` imports `stripe`, behind a Protocol with a fake for tests.
  - The re-checkout matrix is tested: `requires_payment_method` and `requires_confirmation` cancel the old PaymentIntent and order and create new ones; `processing` and `succeeded` reuse and create nothing; any other status reuses.
  - Tests are in `api/tests/unit` and `api/tests/integration/test_checkout.py`.
- [ ] M7-C4: **Webhook.** `POST /webhooks/stripe` is tested in `api/tests/integration/test_webhooks.py`.
  - It verifies the signature, and a bad signature returns 400.
  - Events are inserted into `stripe_events` with `ON CONFLICT DO NOTHING`, so a replayed event is a 200 no-op.
  - `payment_intent.succeeded` rejects an amount or currency mismatch.
  - On a match it sets `paid`, `paid_at` and the daily `ticket_number`, and clears the cart. A unit test shows the counter resets across a venue-timezone boundary.
  - `payment_failed` leaves the order pending.
  - `account.updated` syncs `stripe_charges_enabled`.
- [ ] M7-C5: **Staff order endpoints.** `GET /staff/orders` and `PATCH /staff/orders/{id}/status` are server-validated through the status machine.
  - Integration tests show `pending_payment` orders are never returned to venue staff.
  - A runner cannot move an order to `accepted` or `cancelled`.
  - A cross-venue order id returns 404.
  - An invalid transition returns 409.
- [ ] M7-C6: **Docs and gates.** PLAN.md gets an M7 row noting that M3 is split, with the UI half remaining. CLAUDE.md invariant 4 is updated for `picked_up` and invariant 1 for the `guest_name` exception. `make lint` and `make test` pass with no regressions, and the output summary is reported.
