-- 0010 — The `picked_up` order status (pickup touchpoints).
-- On its own because Postgres cannot use a new enum value in the transaction that adds it,
-- and the next migration's guard, checks and policies use it (same reason as 0008).

alter type public.order_status add value if not exists 'picked_up' after 'delivered';
