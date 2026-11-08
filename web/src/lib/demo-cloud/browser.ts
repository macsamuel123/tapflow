// The browser's side of the shared demo: reads and Realtime with the public key, writes through
// the server. Loaded only when the cloud mode is on.
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { ServiceError } from "@/services/types";
import type { DemoOrderRow, DemoStockRow } from "./config";

export type LiveScope =
  | { kind: "venue"; slug: string }
  | { kind: "order"; id: string }
  | { kind: "stock"; slug: string }
  | { kind: "menu"; slug: string };

const PROBE_TIMEOUT_MS = 2500;

let client: Promise<SupabaseClient> | undefined;

function supabase(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  });
  return client;
}

async function demo() {
  return (await supabase()).schema("demo");
}

function unavailable(): ServiceError {
  return new ServiceError("The shared demo can't be reached right now.");
}

export async function fetchOrders(slug: string): Promise<DemoOrderRow[]> {
  const { data, error } = await (await demo())
    .from("orders")
    .select("*")
    .eq("venue_slug", slug)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw unavailable();
  return data as DemoOrderRow[];
}

export async function fetchOrder(id: string): Promise<DemoOrderRow | null> {
  const { data, error } = await (await demo()).from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw unavailable();
  return data as DemoOrderRow | null;
}

export async function fetchStock(slug: string): Promise<DemoStockRow[]> {
  const { data, error } = await (await demo()).from("item_stock").select("item_id, sold_out").eq("venue_slug", slug);
  if (error) throw unavailable();
  return data as DemoStockRow[];
}

/** A cheap read that shows whether the backend can be reached. */
export async function probe(): Promise<boolean> {
  try {
    // The timeout matters: the client retries failed reads for longer than a polling interval.
    const { error } = await (await demo())
      .from("item_stock")
      .select("item_id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    return !error;
  } catch {
    return false;
  }
}

export async function postJson<T>(path: string, body: unknown, venueKey?: string): Promise<T> {
  return send<T>(path, { method: "POST", body: JSON.stringify(body) }, venueKey);
}

export async function patchJson<T>(path: string, body: unknown, venueKey: string): Promise<T> {
  return send<T>(path, { method: "PATCH", body: JSON.stringify(body) }, venueKey);
}

export async function getJson<T>(path: string, venueKey: string): Promise<T> {
  return send<T>(path, { method: "GET" }, venueKey);
}

export async function sendPhoto(path: string, photo: Blob, venueKey: string): Promise<{ url: string }> {
  return send(path, { method: "POST", body: photo, headers: { "Content-Type": "image/jpeg" } }, venueKey);
}

export async function deletePath(path: string, venueKey: string): Promise<void> {
  await send(path, { method: "DELETE" }, venueKey);
}

/** What a guest's phone can read about a tester's venue: never tokens. */
export async function fetchPublicVenue(slug: string, touchpointId: string) {
  const db = await demo();
  const venue = await db.from("venues").select("id, slug, name, industry, venue_type, country, currency, menu_version, branding").eq("slug", slug).maybeSingle();
  if (venue.error) throw unavailable();
  if (!venue.data) return null;
  const venueId = venue.data.id as string;
  const [menu, touchpoints] = await Promise.all([
    db.from("venue_menus").select("menu").eq("venue_id", venueId).maybeSingle(),
    db.from("touchpoints").select("id, label, service_mode, spot_number, active").eq("venue_id", venueId).eq("id", touchpointId),
  ]);
  if (menu.error || touchpoints.error) throw unavailable();
  const touchpoint = touchpoints.data[0];
  if (!menu.data || !touchpoint) return null;
  return { venue: venue.data, menu: menu.data.menu as unknown, touchpoint };
}

export async function fetchVenueName(slug: string): Promise<{ name: string; currency: string } | null> {
  const { data, error } = await (await demo()).from("venues").select("name, currency").eq("slug", slug).maybeSingle();
  if (error) throw unavailable();
  return data as { name: string; currency: string } | null;
}

/** The PIN pad's venue name and role labels. Public, like the rest of a venue's row. */
export async function fetchStaffVenue(slug: string): Promise<{ name: string; role_labels: Record<string, string> | null } | null> {
  const { data, error } = await (await demo()).from("venues").select("name, role_labels").eq("slug", slug).maybeSingle();
  if (error) throw unavailable();
  return data as { name: string; role_labels: Record<string, string> | null } | null;
}

/** For staff devices: the status code matters (401 wrong PIN, 423 locked), so nothing throws. */
export async function staffRequest<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<{ status: number; body: T & { error?: string } }> {
  const { token, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { "x-staff-token": token } : {}),
      },
    });
  } catch {
    throw unavailable();
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { status: response.status, body };
}

export async function sendImage<T>(path: string, image: Blob, venueKey: string): Promise<T> {
  return send(path, { method: "POST", body: image, headers: { "Content-Type": "image/jpeg" } }, venueKey);
}

export async function deleteJson<T>(path: string, venueKey: string): Promise<T> {
  return send<T>(path, { method: "DELETE" }, venueKey);
}

async function send<T>(path: string, init: RequestInit, venueKey?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body && !init.headers ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
        ...(venueKey ? { "x-venue-key": venueKey } : {}),
      },
    });
  } catch {
    throw unavailable();
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ServiceError(payload.error ?? "Something went wrong. Please try again.");
  return payload as T;
}

export async function subscribe(
  scope: LiveScope,
  onChange: () => void,
  onStatus: (subscribed: boolean) => void,
): Promise<() => void> {
  const db = await supabase();
  const name = `demo-${scope.kind}-${"slug" in scope ? scope.slug : scope.id}-${crypto.randomUUID()}`;
  const listen = (channel: RealtimeChannel, table: string, filter: string) =>
    channel
      .on("postgres_changes", { event: "INSERT", schema: "demo", table, filter }, onChange)
      .on("postgres_changes", { event: "UPDATE", schema: "demo", table, filter }, onChange)
      // Realtime can't filter DELETE events, so Clear and cleanup arrive here unfiltered.
      .on("postgres_changes", { event: "DELETE", schema: "demo", table }, onChange);

  let channel = db.channel(name);
  if (scope.kind === "venue") {
    channel = listen(channel, "orders", `venue_slug=eq.${scope.slug}`);
    channel = listen(channel, "item_stock", `venue_slug=eq.${scope.slug}`);
  } else if (scope.kind === "order") {
    channel = listen(channel, "orders", `id=eq.${scope.id}`);
  } else if (scope.kind === "stock") {
    channel = listen(channel, "item_stock", `venue_slug=eq.${scope.slug}`);
  } else {
    channel = listen(channel, "venues", `slug=eq.${scope.slug}`);
  }
  // SUBSCRIBED only means the socket joined. Database changes flow once this system message
  // arrives, and on a cold project that can be seconds later: orders in that gap would be missed
  // while claiming to be live.
  channel.on("system", {}, (message: { extension?: string; status?: string }) => {
    if (message.extension === "postgres_changes") onStatus(message.status === "ok");
  });
  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") onStatus(false);
  });
  return () => {
    void db.removeChannel(channel);
  };
}
