# PLAN — QR Ordering + Text AI Waiter (MVP)

Source documents: `docs/BRD.pdf` (BRD-2026-V2) and the MVP build prompt. **Where the two differ, the MVP prompt wins.** Every deviation from the BRD is listed in §5.

## 1. Architecture

```mermaid
flowchart LR
  Diner["Diner phone<br/>Next.js PWA"] -- "REST (X-Session-Token)" --> API[FastAPI]
  Diner -- "anon Realtime: menu changes<br/>+ broadcast order:{id}" --> RT[(Supabase Realtime)]
  KDS["KDS / Dashboard<br/>Next.js + Supabase Auth"] -- "staff JWT" --> API
  KDS -- "postgres_changes (RLS)" --> RT
  API -- "psycopg3 pool" --> PG[(Postgres + RLS)]
  API -- "tools + judge" --> LLM["llm_client.py → OpenAI gpt-4o-mini"]
  API -- "PaymentIntent / Account Links" --> Stripe
  Stripe -- "signed webhooks" --> API
  PG --> RT
```

- **Diners** never write to Supabase directly. They get menus from the API. Anon Realtime is SELECT-only on the non-sensitive menu tables, so 86 updates arrive live. Order status reaches the diner through an API-sent Realtime **Broadcast** on `order:{order_id}`, with payload **`{status, ticket_number}` only** (no amounts, items or PII). A GET-endpoint poll is the fallback. Anon can never read `orders`.
- **Staff** sign in with a Supabase magic link. The KDS subscribes to `orders` via `postgres_changes`, and RLS decides what each user can see. Writes (status, 86, CRUD) go through the API. The API verifies the Supabase JWT, checks `staff_members`, and runs the query inside `SET LOCAL ROLE authenticated` + `request.jwt.claims`, so RLS also applies to the API's own staff queries (defense in depth).
- **API DB access:** psycopg 3 (async pool), hand-written SQL in `repositories/`, Pydantic v2 at every boundary. No ORM, because the queries are few and need to be explicit about money.
- **Next.js rewrites** `/api/*` → FastAPI, so the browser sees a single origin. That simplifies CORS and lets one tunnel (`make tunnel`) cover both.

## 2. Folder tree

```
restaurant_app/
├─ Makefile  .gitignore  README.md  PLAN.md  CLAUDE.md  .env.example  package.json (supabase CLI pin)
├─ docs/BRD.pdf
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/  0001_schema.sql 0002_rls.sql 0003_realtime.sql 0004_functions.sql
│  ├─ seed.sql                         # Demo Bistro, 5 tables, ~20 items / 4 categories, demo owner + kitchen users
│  └─ tests/rls_cross_tenant.test.sql  # pgTAP via `supabase test db`
├─ api/
│  ├─ pyproject.toml  uv.lock  .env.example
│  ├─ app/
│  │  ├─ main.py  config.py  db.py  deps.py            # deps: session + staff auth
│  │  ├─ domain/       pricing.py qr_tokens.py cart_rules.py money.py tickets.py
│  │  ├─ ai/           llm_client.py waiter.py tools.py validator.py prechecks.py
│  │  │                judge.py prompts.py grounding.py audit.py
│  │  ├─ payments/     stripe_service.py webhooks.py
│  │  ├─ repositories/ menu.py carts.py orders.py sessions.py tables.py restaurants.py audit.py
│  │  ├─ routers/      sessions.py menu.py cart.py chat.py checkout.py webhooks.py staff_*.py
│  │  └─ schemas/      Pydantic request/response models
│  ├─ tests/  unit/  integration/
│  └─ evals/  run_judge_evals.py  cases.yaml
└─ web/
   ├─ package.json next.config.ts tsconfig.json (strict) playwright.config.ts
   ├─ src/app/
   │  ├─ r/[slug]/t/[tableId]/page.tsx   r/[slug]/t/[tableId]/checkout/page.tsx
   │  ├─ order/[orderId]/page.tsx  kds/[slug]/page.tsx  dashboard/…  login/page.tsx
   │  └─ manifest.ts
   ├─ src/components/  menu, cart, modifier-sheet, chat-drawer (dynamic import), kds, dashboard
   ├─ src/lib/  api-client.ts api-types.ts (openapi-typescript) database.types.ts (supabase gen types) supabase.ts money.ts
   ├─ public/sounds/alarm.wav
   └─ e2e/order-flow.spec.ts
```

## 3. Data model (refinements to the prompt's §5)

The base tables are as specified: `restaurants`, `staff_members`, `tables`, `menu_categories`, `menu_items`, `modifier_groups`, `modifiers`, `table_sessions`, `cart_items`, `orders`, `order_items`, `chat_messages`, `ai_audit_log`, `stripe_events`. Changes:

| Change | Why |
|---|---|
| `restaurant_id` on `modifier_groups` and `modifiers` (denormalized; a trigger checks it matches the parent) | RLS without joins; Realtime filter `restaurant_id=eq.X` |
| `sort_order` on `modifier_groups`/`modifiers`; `updated_at` on mutable tables | Stable UI ordering; cache busting |
| `staff_members` PK `(user_id, restaurant_id)` | A user can work at several restaurants |
| `orders`: add `currency`, `ticket_number int`, `ticket_date date`, `status_updated_at`. `restaurants`: add `timezone` (IANA, default `America/New_York`). New table `ticket_counters(restaurant_id, local_date, last_number)` | Short kitchen ticket numbers that **reset daily per restaurant, by restaurant-local date**. Assigned at *paid* time with `INSERT … ON CONFLICT DO UPDATE SET last_number = last_number + 1 RETURNING` (atomic). Unique index on `(restaurant_id, ticket_date, ticket_number)`. |
| `order_items.modifiers_snapshot` = `[{id, name, price_delta_cents}]` | Immutable receipt |
| `ai_audit_log`: add `flagged bool`, `prompt_tokens`, `completion_tokens` | Flag review; cost visibility |
| `chat_messages.role` enum `user \| assistant \| tool` | Multi-turn replay |
| `restaurants.platform_fee_bps` defaults to env `PLATFORM_FEE_BPS` (300) | Per-tenant override |
| `tables.qr_secret`: column-level REVOKE from `anon`/`authenticated` | The secret never leaves the server |
| CHECKs: every `*_cents >= 0`, `quantity BETWEEN 1 AND 20`, `min_select <= max_select` | The DB backs up the invariants |

**RLS summary.** RLS is enabled on every table.
- `anon`: SELECT on `menu_categories`, `menu_items`, `modifier_groups` and `modifiers` only.
- `authenticated`: rows where `restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid())`. Orders are visible to staff only when `status <> 'pending_payment'`, which enforces "tickets only after payment" at the DB layer.
- Owner-only: `tables`, updates to `restaurants`, `staff_members`.
- `table_sessions`, `cart_items`, `chat_messages`, `ai_audit_log`, `stripe_events`, `ticket_counters`: API-only (no anon or authenticated policies).

## 4. Key flows and decisions

**QR token.** `base64url_nopad(HMAC_SHA256(qr_secret, f"{slug}:{table_id}"))`, verified with `hmac.compare_digest`. `POST /tables/{id}/rotate-secret` invalidates old codes.

**Diner session.** `POST /sessions` returns `session_id`, `verified` and `session_token` (HMAC of session_id with `SESSION_SECRET`). The client sends it as `X-Session-Token`. Sessions expire after 4 hours. Inactive tables are rejected. Unverified sessions can browse and chat, but checkout returns `403 table_not_verified`.

**Pricing** (integer cents, pure functions in `domain/pricing.py`):
- `line = (item.price + Σ modifier.delta) × qty`; `subtotal = Σ lines`
- `tax = round_half_up(subtotal × tax_rate_bps / 10000)`, computed on the order subtotal, not per line
- `platform_fee = round_half_up(subtotal × platform_fee_bps / 10000)`, **on the pre-tax subtotal**
- `total = subtotal + tax + tip` (tip = 0)
- Prices are **tax-exclusive**, the default currency is **USD**, and `round_half_up(n, bps) = (n*bps + 5000) // 10000`

**Checkout.** Requires a verified session, a non-empty cart, `stripe_charges_enabled`, and a re-check of stock. In one transaction it creates a `pending_payment` order with price and name snapshots. It then creates the PaymentIntent with `automatic_payment_methods`, `application_fee_amount`, `transfer_data.destination`, `metadata.order_id`, and idempotency key = order id. Each session has at most one pending order. **On re-checkout**, it retrieves the existing PaymentIntent:
- `requires_payment_method` / `requires_confirmation` → cancel the PaymentIntent and the old order, then create a new order and PaymentIntent (the cart may have changed).
- `processing` / `succeeded` → **reuse it**: return the existing order and client_secret and create nothing new. The webhook finalizes it.
- Anything else (e.g. `requires_action`) → reuse it so the diner can finish 3DS.

**Webhook.** Verify the signature, then in one transaction `INSERT INTO stripe_events … ON CONFLICT DO NOTHING` (already seen → 200 no-op).
- `payment_intent.succeeded`: assert `amount_received == total_cents` and the currency matches, set `paid`, `paid_at` and the daily `ticket_number`, clear the cart, and broadcast `{status, ticket_number}`.
- `payment_intent.payment_failed`: the order stays `pending_payment`; log it.
- `account.updated`: sync `stripe_charges_enabled`.

**Order status machine.** `paid → acknowledged → preparing → ready → completed`; `cancelled` from `paid` or `acknowledged`. The server validates every transition. Refunds go through the Stripe Dashboard for the MVP.

**AI turn** (`ai/waiter.py`):
1. **Grounded context** (`grounding.py`): a restaurant-scoped system prompt with compact JSON of **in-stock** items (id, name, price_cents, description, ingredients, allergens, dietary_tags, modifier groups), the allergen-language rules, and the session's dietary constraints. No secrets and no other tenants' data. Diner text goes **only** in the `user` role. Messages are capped at 500 characters, and each session is rate-limited to 30 messages per 10 minutes.
2. **Tool loop** (≤4 rounds). Tools: `get_item_details`, `add_to_cart`, `remove_from_cart`, `view_cart`, `set_dietary_constraints`. None of them accepts a price. Arguments are parsed with strict Pydantic (`extra="forbid"`; unknown tool → reject). **Layer 1** (`validator.py`) then checks: same restaurant, in stock, modifiers belong to the item, required groups satisfied, min/max respected, quantity 1–20. On failure it returns structured `{error_code, message}` to the model (≤2 retries) and never executes. Malformed model output is discarded.
3. **Deterministic pre-checks** (`prechecks.py`) on the draft:
   - **Prices:** the regex catches `$12`, `$12.50`, `12.50`, `12 dollars`, `12.50 dollars` and `USD 12`. Every captured amount, in cents, must equal a server-known amount in the facts (base price, modifier delta, line or cart total). Otherwise fail.
   - **Allergen claims:** "safe for …" always fails. "X-free" / "free of X" passes **only if** the item has a matching `X-free` entry in `dietary_tags` **and** the sentence uses "the restaurant marks this as X-free" **and** the reply includes the cross-contact caveat. Any unmatched claim auto-fails.
4. **Layer 2 judge** (`judge.py`): a separate gpt-4o-mini call at `temperature=0`, with `json_schema` output `{verdict: "pass"|"fail", issues: [...]}`. Its input is only the draft, facts for the mentioned items, and the session's dietary constraints. "Mentioned items" = items touched by tool calls this turn plus items whose names fuzzy-match the draft. Matching runs against the full menu *including out-of-stock* items, so the judge can flag them. Any dish named without supplied facts → fail.
5. **On fail**, regenerate once with the issues as feedback. If it fails again, return `"I can't confirm that — please check with staff."` with `flagged=true`.
6. **Audit:** write drafts, tool calls, Layer 1 results, pre-check results, judge verdicts, final reply, latency and tokens to `ai_audit_log`.

**`llm_client.py`.** A `LLMClient` Protocol, `complete(messages, tools=None, response_format=None, temperature=…)`, implemented by `OpenAIClient` and by `FakeLLMClient` (scripted) for unit tests. It's the only module that imports `openai`.

**KDS.** Realtime `postgres_changes` plus a 15s heartbeat. If the channel isn't `SUBSCRIBED` or the heartbeat is missed, it falls back to polling `GET /staff/orders` every 5s. A visible indicator shows Live (green), Polling (amber) or Offline (red). A "Tap to enable sound" gate unlocks audio, and the alarm loops while any order is `paid` and unacknowledged. It requests a Screen Wake Lock. The 86 panel is on the same page. A ticket shows an "item now 86'd" warning badge if an ordered item went out of stock after checkout.

**Frontend performance.** The chat drawer loads via `next/dynamic`. Stripe (`@stripe/react-stripe-js`) is imported only on the checkout route. The menu page is server-rendered.

**Owner onboarding.** A first sign-in with no membership shows a "Create restaurant" form. The seed creates a demo owner and kitchen user for Demo Bistro. Inviting staff from the dashboard is a stretch goal in M6; otherwise use Supabase Studio.

**CSV import.** Columns: `category,name,description,price_cents,ingredients,allergens,dietary_tags`. List fields are separated by `|`. Modifiers are edited in the UI. Import sits behind a `MenuImporter` interface (CSV now, vision in Phase 4).

## 5. Deviations and gaps vs the BRD

| BRD item | MVP decision |
|---|---|
| Judge "sub-200ms" (FR-2.3) | Not realistic for a second LLM round trip (~400–1000ms). The judge runs synchronously, and cheap deterministic pre-checks run first. Latency is recorded in `ai_audit_log`. |
| "Direct payouts" (FR-3.1) | Destination charges with `application_fee_amount` + `transfer_data.destination`, as the prompt specifies. No `on_behalf_of` in the MVP (keeps Apple Pay domain registration on the platform). |
| Apple Pay / Google Pay | Need an HTTPS domain registered in Stripe, so they won't appear on `localhost`. Use `make tunnel` with a registered domain. Cards work everywhere. |
| FCP < 1.0s on 4G, bundle < 1.2MB (FR-1.2) | Targeted; a Lighthouse run in M6 records the actual result. |
| Audio alert reliability > 99.9% | Best effort: autoplay gate, wake lock, polling fallback. A browser can't guarantee it (tab sleep, muted device). |
| Voice / STT / TTS (FR-2.4) | Out of scope. `ai/waiter.py` is text-in/text-out, so a voice adapter can wrap it later. |
| Vision menu ingestion | Out of scope. Manual entry or CSV via `MenuImporter`. |
| Geolocation table-fraud check | Out of scope. A `geofence` column can be added to `restaurants` later. |
| POS / thermal printer | Out of scope. |
| Platform-admin dashboard | Out of scope. Use Supabase Studio + Stripe Dashboard. |
| Tips | `tip_cents` column, default 0, no UI. |
| "Grounded RAG" (FR-3.3, Phase 2) | No vector DB. The in-stock menu JSON is injected as **grounded context**. |
| Offline PWA | Manifest only, no offline service-worker caching. |
| Item 86'd between checkout and payment | Payment still succeeds (the PaymentIntent was created at checkout) and the ticket reaches the KDS with a warning badge. **The kitchen cancels the order and refunds it via the Stripe Dashboard.** No automated refund in the MVP. |

## 6. Environment variables

Provided by you: `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PLATFORM_FEE_BPS` (default 300), `APP_BASE_URL`.

Added by this plan:
- `DATABASE_URL`: local default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- `SESSION_SECRET`: HMAC key for diner session tokens
- `SUPABASE_JWT_SECRET`: optional HS256 fallback; JWKS verification is preferred
- `STRIPE_CONNECT_WEBHOOK_SECRET`: optional, for a separate Connect endpoint in production. Locally, `stripe listen --forward-connect-to` uses one secret.
- Web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `API_INTERNAL_URL` (rewrite target, default `http://127.0.0.1:8000`)

## 7. Tooling setup (WSL2 Ubuntu)

Keep the repo on the Linux filesystem (e.g. `~/code/restaurant_app`), not under `/mnt/c/...`.

```bash
# Windows: Docker Desktop → Settings → Resources → WSL integration → enable for Ubuntu
sudo apt update && sudo apt install -y build-essential make git curl unzip ca-certificates
# Node 22 LTS + pnpm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install 22
corepack enable && corepack prepare pnpm@latest --activate
# uv + Python 3.12
curl -LsSf https://astral.sh/uv/install.sh | sh && uv python install 3.12
# Stripe CLI
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install -y stripe
# cloudflared (make tunnel)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb && sudo apt install -y /tmp/cf.deb
```

The Supabase CLI is pinned as a devDependency in the root `package.json` (`pnpm exec supabase`). Run `docker ps` inside WSL to check Docker before `make dev`. Open VS Code with the WSL extension (`code .` from Ubuntu).

**`make tunnel` (added in M3).** Runs `cloudflared tunnel --url http://localhost:3000` and prints the HTTPS URL. Set `APP_BASE_URL` to that URL so printed QRs point at it. That lets you scan QRs with a real phone. For wallet testing, register the tunnel domain under Stripe → Payment method domains. Quick tunnels change hostname on every run, so a named tunnel is better for repeated wallet tests.

## 8. Testing strategy

| Layer | What |
|---|---|
| pytest unit | Pricing and rounding; QR tokens; cart/modifier rules; Layer 1 validator (forged price arg, extra fields, unknown tool, 86'd item, foreign-restaurant item, modifier min/max, quantity bounds); pre-checks (`$12`, `$12.50`, `12.50`, `12 dollars`; tagged vs untagged "X-free"; "safe for"); judge loop with `FakeLLMClient` (pass; fail→regen→pass; fail→fail→fallback + flag); re-checkout PaymentIntent reuse/cancel matrix; daily ticket reset across a timezone boundary; webhook signature, idempotency and amount mismatch |
| pytest integration | Against local Supabase Postgres; each test runs in a transaction that is rolled back |
| pgTAP | `supabase/tests/rls_cross_tenant.test.sql`: staff A can't read B's orders; kitchen can't see `pending_payment`; anon can't read orders or `qr_secret` |
| Playwright (M3) | QR URL → add items → card 4242 → order appears on the KDS (`stripe listen` running) |
| Evals (M5) | `api/evals/run_judge_evals.py`: ~25 adversarial cases against the real API; prints the pass rate (target ≥ 95%) |
| Static | ruff, mypy `--strict`, eslint, `tsc --noEmit` |

## 9. Milestones

| # | Scope | Done when |
|---|---|---|
| M0 | PLAN.md, CLAUDE.md | Committed |
| M1 | Scaffold, migrations + RLS + seed, FastAPI health, `.env.example`, Makefile | `make dev` runs all three; RLS cross-tenant test passes |
| M2 | QR tokens, sessions, menu page, modifier picker, server-priced cart | pytest covers tokens, modifier rules, pricing math |
| M3 | Connect onboarding, checkout, webhook, KDS (alarm, ack, statuses, polling fallback), 86ing, order status page, `make tunnel` | Playwright: scan → add → pay 4242 → KDS |
| M4 | Chat endpoint, grounded prompt, tool calling, Layer 1, chat UI | Tests: forged price rejected, 86'd item rejected, off-menu refused |
| M5 | Judge, pre-checks, regenerate-once, fallback, audit | Eval script ≥ 95% |
| M6 | Dashboard (menu CRUD + CSV, tables/QR sheet, orders), polish, Lighthouse, README + Mermaid + demo script | Lint, tests and Lighthouse reported |

After each milestone: what was built, how to run and test it, what's stubbed, what's next, and lint/test output summaries.
