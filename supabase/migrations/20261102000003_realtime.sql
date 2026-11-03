-- 0003 — Realtime publication.
--   orders      → KDS / runner view (postgres_changes, filtered by RLS)
--   menu_items  → live 86 updates on diner menus
--   modifiers   → live 86 updates for modifiers

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.orders, public.menu_items, public.modifiers;
