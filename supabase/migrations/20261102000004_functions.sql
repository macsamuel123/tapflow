-- 0004 — Ticket numbering + order status guard.

-- Per-restaurant, per-local-day ticket counter. Atomic under concurrency.
create or replace function app.next_ticket_number(rid uuid, p_local_date date) returns int
language sql volatile security definer set search_path = '' as $$
  insert into public.ticket_counters as tc (restaurant_id, local_date, last_number)
  values (rid, p_local_date, 1)
  on conflict (restaurant_id, local_date)
    do update set last_number = tc.last_number + 1
  returning last_number;
$$;
revoke all on function app.next_ticket_number(uuid, date) from public, anon, authenticated;
grant execute on function app.next_ticket_number(uuid, date) to service_role;

-- Defense in depth for the status machine (the API validates too):
--   pending_payment → paid | cancelled
--   paid            → accepted | cancelled
--   accepted        → ready | cancelled
--   ready           → delivered
-- Each transition stamps its timestamp if the caller did not.
create or replace function app.guard_order_status() returns trigger
language plpgsql as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
       (old.status = 'pending_payment' and new.status in ('paid', 'cancelled'))
    or (old.status = 'paid'            and new.status in ('accepted', 'cancelled'))
    or (old.status = 'accepted'        and new.status in ('ready', 'cancelled'))
    or (old.status = 'ready'           and new.status = 'delivered')
  ) then
    raise exception 'invalid order status transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  new.status_updated_at := now();
  case new.status
    when 'paid'      then new.paid_at      := coalesce(new.paid_at, now());
    when 'accepted'  then new.accepted_at  := coalesce(new.accepted_at, now());
    when 'ready'     then new.ready_at     := coalesce(new.ready_at, now());
    when 'delivered' then new.delivered_at := coalesce(new.delivered_at, now());
    when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
    else null;
  end case;
  return new;
end $$;

create trigger orders_status_guard before update of status on public.orders
  for each row execute function app.guard_order_status();
