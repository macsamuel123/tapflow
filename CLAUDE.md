# CLAUDE.md

Multi-tenant QR ordering platform with a text AI waiter. The architecture and all decisions are in [PLAN.md](PLAN.md). The BRD is `docs/BRD.pdf`; where it differs from PLAN.md, PLAN.md wins.

## Layout
- `web/`: Next.js 15 (App Router), TypeScript strict, Tailwind, pnpm
- `api/`: FastAPI, Python 3.12, Pydantic v2, uv, pytest
- `supabase/`: migrations, RLS, seed, pgTAP tests

## Commands (run from the repo root in WSL2)
| Command | What it does |
|---|---|
| `make dev` | `supabase start` + API (uvicorn :8000) + web (next :3000) |
| `make test` | pytest + `supabase test db` (pgTAP) + web typecheck/unit tests |
| `make lint` | ruff, mypy --strict, eslint, `tsc --noEmit` |
| `make seed` | `supabase db reset` (re-applies migrations + seed.sql) |
| `make types` | `supabase gen types` → `web/src/lib/database.types.ts`; openapi-typescript → `web/src/lib/api-types.ts` |
| `make e2e` | Playwright order-flow test (needs `make stripe-listen`) |
| `make evals` | `api/evals/run_judge_evals.py` against the real OpenAI API |
| `make stripe-listen` | `stripe listen --forward-to … --forward-connect-to …` |
| `make tunnel` | cloudflared HTTPS tunnel to :3000 (M3+) |

Run `make lint` and `make test` before calling a milestone done, and report the output summary.

## Conventions
- **Money is always integer cents** (`Cents` type in `api/app/domain/money.py`). No floats anywhere in pricing, Python or TS.
- TS `strict`. Pydantic `extra="forbid"` on every inbound model. Everything typed; the Supabase client uses generated types.
- SQL lives only in `api/app/repositories/`. Only `api/app/ai/llm_client.py` imports `openai`. Only `api/app/payments/` imports `stripe`.
- Migrations are append-only: add a new file and never edit an applied one.
- Small, reviewable commits per milestone. Never commit secrets: `.env*` is gitignored except `.env.example`.
- Out of scope (don't build): voice, vision ingestion, geolocation, POS/printer, admin dashboard, tips UI, vector DB.

## Non-negotiable invariants (enforced in code AND tested)
Test names are the targets each invariant must be covered by. Keep this list in sync as the tests are written.

1. **Zero financial trust in the LLM.** The LLM never produces, sets or modifies a price, subtotal, tax, fee or total. Clients send only `item_id`, `modifier_ids`, `quantity`, `notes`. The API computes every amount from DB prices in integer cents. Order line items snapshot the price at purchase time.
   → `tests/unit/test_pricing.py`, `tests/unit/test_validator.py::test_forged_price_argument_rejected`, `tests/integration/test_checkout.py::test_order_items_snapshot_prices`
2. **Layer 1: tool calls validated deterministically before execution.** Strict schemas; reject unknown tools, extra fields and wrong types. Check: item exists, belongs to this restaurant, in stock, each modifier belongs to the item, required groups satisfied, min/max respected, quantity 1–20. On failure, return a structured error to the model (max 2 retries) and never execute.
   → `tests/unit/test_validator.py`
3. **Layer 2: every AI text reply is judged** by an isolated gpt-4o-mini call (temperature 0, JSON-schema `{verdict, issues}`). Its input is only the draft, facts for mentioned items, and the session's dietary constraints. It fails replies that mention off-menu or out-of-stock items, state ungrounded allergen or ingredient facts, quote wrong prices, or claim "safe for" an allergy. On fail, regenerate once; on a second fail, return the safe fallback and flag it.
   → `tests/unit/test_judge_loop.py`, `tests/unit/test_prechecks.py`, `evals/run_judge_evals.py`
4. **Allergen language.** "This dish does not list X as an ingredient" plus "cross-contact can't be ruled out". Never "safe for X". "X-free" only as "the restaurant marks this as X-free" when the item's `dietary_tags` has it, plus the cross-contact caveat.
   → `tests/unit/test_prechecks.py`
5. **Prompt-injection sandboxing.** Diner text only in the `user` role. The system prompt is restaurant-scoped, with no secrets or other tenants' data. Non-conforming model output (bad JSON, unknown tool) is discarded.
   → `tests/unit/test_grounding.py`, `tests/unit/test_validator.py::test_unknown_tool_discarded`
6. **Tickets only after payment.** An order is visible on the KDS only after the signature-verified, idempotent `payment_intent.succeeded` webhook marks it paid. RLS hides `pending_payment` from staff.
   → `tests/integration/test_webhooks.py`, `supabase/tests/rls_cross_tenant.test.sql`
7. **Tenant isolation via RLS** on every tenant table. Staff only see their own restaurants.
   → `supabase/tests/rls_cross_tenant.test.sql` (staff of A cannot read B's orders)
8. **Signed QR tokens.** `token = base64url(HMAC_SHA256(table.qr_secret, f"{rest_slug}:{table_id}"))`. Valid → verified session (can order). Missing or invalid → browse and chat only; checkout disabled with a "scan the QR on your table" message. Rotating the secret invalidates old QRs.
   → `tests/unit/test_qr_tokens.py`, `tests/integration/test_sessions.py`
9. **Every AI turn is audited** in `ai_audit_log`: draft, tool calls, Layer 1 result, judge verdict, final reply, latency, tokens.
   → `tests/integration/test_chat_audit.py`
