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
- **Staff** (owner, manager, fulfillment, runner) and **platform admins** sign in with a Supabase magic link. The KDS and runner views subscribe to `orders` via `postgres_changes`, and RLS decides what each user can see. Every write (status changes, 86, CRUD) goes through the API. The API verifies the Supabase JWT and checks `staff_members` membership before writing.
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

**CSV import.** Columns: `category,name,description,price_cents,ingredients,allergens,dietary_tags`. List fields are separated by `|`. It sits behind a `MenuImporter` interface (vision import later).

## 5. Deviations and gaps vs the BRD

| BRD item | MVP decision |
|---|---|
| AI concierge, tool calling, LLM judge (FR-2.1–2.3, Phases 2–3) | **Deferred to Phase 2** (§10). |
| Voice (FR-2.4), vision onboarding | Phase 4; out of scope. |
| "Direct payouts" (FR-3.1) | Destination charges + `application_fee_amount`. No `on_behalf_of`. |
| Apple Pay / Google Pay | Need a registered HTTPS domain, so use `make tunnel` (M3). Cards work everywhere. |
| FCP < 1.0s, bundle < 1.2MB (FR-1.2) | Targeted; Lighthouse in M4. |
| Audio alert reliability > 99.9% | Best effort (autoplay gate, wake lock, polling fallback). |
| Geolocation fraud check, POS/printer, admin dashboard | Out of scope. |
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
| M3 | Pay + KDS + delivery: Connect onboarding, checkout, webhook, KDS (3 columns, alarm, runner view, polling fallback), 86ing, diner status page, tip selection, ExpressCheckout (Apple Pay / Google Pay), `make tunnel` | Playwright: scan → pay → accept → ready → delivered |
| M4 | Owner dashboard + polish: menu CRUD + CSV, touchpoints + printable QR sheet, Stripe status, order history, empty/error/loading states, Lighthouse, README + Mermaid + demo script | Lint, tests and Lighthouse reported |

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
- **Pickup mode:** a venue-side fulfillment option with no touchpoint. The order carries a pickup name or number instead of a touchpoint label. It reuses the same status machine and the same `paid`-only ticket rule.
- **Station routing:** route each order item to a station (bar vs kitchen, or other) so each station's KDS shows only its items. Ticket status stays per order, with per-station acknowledgement.
- **Multi-vendor split checkout:** one diner payment that splits across several vendors or venues. Destination charges per vendor, each with its own `application_fee_amount` and tax breakdown.
