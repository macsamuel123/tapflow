# CLAUDE.md

Multi-venue QR ordering platform (TapFlow). **MVP core loop: scan → order + pay → fulfillment ticket → runner delivers.** The architecture and all decisions are in [PLAN.md](PLAN.md). The BRD is `docs/BRD.pdf`; where it differs from PLAN.md, PLAN.md wins. The AI waiter is Phase 2 (PLAN.md §10). Don't build it in the MVP.

## Layout
- `web/`: Next.js 15 (App Router), TypeScript strict, Tailwind, pnpm
- `api/`: FastAPI, Python 3.12, Pydantic v2, uv, pytest
- `supabase/`: migrations, RLS, seed, pgTAP tests

The repo lives in WSL2 at `~/code/restaurant_app`. Run all commands from there.

## Commands
| Command | What it does |
|---|---|
| `make install` | pnpm install (root + web) and `uv sync` (api) |
| `make dev` | `supabase start` + API (uvicorn :8000) + web (next :3000) |
| `make stop` | Kill API + web dev servers, then `supabase stop` |
| `make seed` | `supabase db reset` (re-applies migrations + seed.sql) |
| `make test` | `test-api` (pytest) + `test-db` (pgTAP via `supabase test db`; fails unless it reports `Result: PASS`) |
| `make lint` | ruff, mypy --strict, eslint, `tsc --noEmit` |
| `make types` | `supabase gen types` → `web/src/lib/database.types.ts` |
| `make qr-urls` | Print the signed dev touchpoint URLs for the seed venue |
| `make e2e` | Playwright order flow (M3; needs `make stripe-listen`) |
| `make e2e-saas` | Playwright S0 demo flow at 390px (first run: `pnpm --dir web exec playwright install --with-deps chromium`) |
| `make stripe-listen` | `stripe listen` forwarding to the API webhook (M3) |
| `make tunnel` | cloudflared HTTPS tunnel to :3000 (M3) |

Run `make lint` and `make test` before calling a milestone done, and report the output summary.

## Conventions
- **Money is always integer cents** (`Cents` in `api/app/domain/money.py`). No floats anywhere in pricing, Python or TS.
- TS `strict`. Pydantic `extra="forbid"` on every inbound model. Everything typed; the Supabase client uses generated types.
- SQL lives only in `api/app/repositories/`. Only `api/app/payments/` imports `stripe`.
- Migrations are append-only: add a new file and never edit an applied one.
- Seed and defaults: CAD, `America/Vancouver`. Taxes: GST 500 bps, PST 1000 bps. Food → GST; Alcohol → GST + PST.
- Tax: each menu item has a tax category, which maps to a set of taxes. Each tax is rounded half-up on its own taxable base, then summed. Tax is never applied to tax. Never a single venue-wide rate.
- Small, reviewable commits per milestone. Never commit secrets: `.env*` is gitignored except `.env.example`.
- Out of scope: AI waiter/judge (Phase 2), voice, vision ingestion, geolocation, POS/printer. The platform admin panel is M5 (PLAN.md §11). Tips land in M3 (tip_cents, untaxed).

## Non-negotiable invariants (MVP, enforced in code AND tested)
1. **Zero financial trust in clients.** Clients send only `item_id`, `modifier_ids`, `quantity`, `notes`. The API computes every amount from DB prices in integer cents. Order items snapshot names and prices at purchase time.
   → `api/tests/unit/test_pricing.py`, `api/tests/integration/test_checkout.py`
2. **Cart rules validated server-side.** The item exists, belongs to this venue, and is in stock. Every modifier belongs to that item. Required groups are satisfied, min/max selections respected, quantity 1–20. Extra or unknown fields are rejected.
   → `api/tests/unit/test_cart_rules.py`
3. **Tickets only after payment.** An order reaches `paid` (and becomes visible to staff) only through the signature-verified, idempotent `payment_intent.succeeded` webhook. RLS hides unpaid orders from venue staff, including abandoned checkouts. Platform admins can read them, read-only, for support.
   → `api/tests/integration/test_webhooks.py`, `supabase/tests/rls_cross_tenant.test.sql`, `supabase/tests/rls_roles.test.sql`
4. **Valid status transitions only.** `paid → accepted → ready → delivered`; `cancelled` only from `paid` or `accepted`. Staff can never set `paid`. Each transition stamps its timestamp.
   → `api/tests/unit/test_order_status.py`
5. **Tenant isolation via RLS** on every tenant touchpoint. Staff only see their own venues. `touchpoints.qr_secret` is never readable by clients. Roles are owner, manager, fulfillment and runner; only owners and platform admins read payment data. Platform admins (`platform_admins`, not a venue role) read across venues through their own policies and never write directly.
   → `supabase/tests/rls_cross_tenant.test.sql`, `supabase/tests/rls_roles.test.sql`
6. **Signed QR tokens.** `token = base64url(HMAC_SHA256(touchpoint.qr_secret, f"{rest_slug}:{touchpoint_id}"))`. Valid → verified session (can check out). Missing or invalid → browse only; checkout disabled with "scan the QR on your touchpoint". Rotating the secret invalidates old QRs.
   → `api/tests/unit/test_qr_tokens.py`, `api/tests/integration/test_sessions.py`

## Phase 2 invariants (not active; see PLAN.md §10)
No LLM-produced amounts. Layer 1 tool validation. Layer 2 judge on every reply. Allergen phrasing rules. Prompt-injection sandboxing. Full AI audit log.
