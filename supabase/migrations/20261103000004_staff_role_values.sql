-- 0008 — Staff roles are owner, manager, fulfillment, runner.
-- On its own because Postgres cannot use a new enum value in the transaction that adds it,
-- and the next migration's policies use these values.

alter type public.staff_role add value if not exists 'manager' before 'fulfillment';
alter type public.staff_role add value if not exists 'runner' after 'fulfillment';
