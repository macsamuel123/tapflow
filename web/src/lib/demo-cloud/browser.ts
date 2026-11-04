// The browser's side of the shared demo: reads and Realtime with the public key, writes through
// the server. Loaded only when the cloud mode is on.
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { ServiceError } from "@/services/types";
import type { DemoOrderRow, DemoStockRow } from "./config";

export type LiveScope = { kind: "venue"; slug: string } | { kind: "order"; id: string } | { kind: "stock"; slug: string };

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

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  } else {
    channel = listen(channel, "item_stock", `venue_slug=eq.${scope.slug}`);
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
