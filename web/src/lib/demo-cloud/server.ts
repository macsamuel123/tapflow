import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

let client: SupabaseClient | undefined;

/** Server only: the service key must never reach a browser. */
export function adminClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Hashed, so raw IP addresses never reach the database. */
export function clientKey(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

const DATABASE_ERRORS: Record<string, [number, string]> = {
  rate_limited: [429, "Too many requests. Wait a minute and try again."],
  invalid_transition: [409, "That order can't move to that step."],
  not_found: [404, "That order no longer exists."],
};

export function databaseError(message: string): NextResponse {
  const known = DATABASE_ERRORS[message];
  return known ? jsonError(known[0], known[1]) : jsonError(500, "Something went wrong. Please try again.");
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
