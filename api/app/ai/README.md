# app/ai — reserved for Phase 2

The AI waiter and its LLM judge aren't part of the MVP. The design is in [PLAN.md §10](../../../PLAN.md).

When Phase 2 starts, this package will hold:
- `llm_client.py`: the only module allowed to import `openai`.
- `grounding.py`, `tools.py`, `validator.py`, `prechecks.py`, `judge.py`, `waiter.py`, `audit.py`.

Cart changes the AI makes must go through the same server-side validation as UI cart changes (`app/domain/cart_rules.py`). The AI must never supply or change an amount.
