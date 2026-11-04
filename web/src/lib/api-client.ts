import type { AddCartItem, Cart, CreatedSession, Menu, Session } from "./api-types";

// Browser: same-origin /api (Next.js rewrite → FastAPI). Server components: straight to the API.
function baseUrl(): string {
  if (typeof window !== "undefined") return "/api";
  return process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type ErrorBody = { detail?: { code?: string; message?: string } | unknown };

async function request<T>(path: string, init: RequestInit & { sessionToken?: string } = {}): Promise<T> {
  const { sessionToken, headers, ...rest } = init;
  const res = await fetch(`${baseUrl()}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    const detail = body.detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      const d = detail as { code?: string; message?: string };
      throw new ApiError(res.status, d.code ?? "error", d.message ?? "Something went wrong.");
    }
    throw new ApiError(res.status, "error", "Something went wrong. Please try again.");
  }
  return (await res.json()) as T;
}

export function getMenu(slug: string): Promise<Menu> {
  return request<Menu>(`/venues/${encodeURIComponent(slug)}/menu`);
}

export function createSession(body: {
  venue_slug: string;
  touchpoint_id: string | null;
  token: string | null;
}): Promise<CreatedSession> {
  return request<CreatedSession>("/sessions", { method: "POST", body: JSON.stringify(body) });
}

export function getSession(sessionToken: string): Promise<Session> {
  return request<Session>("/sessions/me", { sessionToken });
}

export function getCart(sessionToken: string): Promise<Cart> {
  return request<Cart>("/cart", { sessionToken });
}

export function addCartItem(sessionToken: string, line: AddCartItem): Promise<Cart> {
  return request<Cart>("/cart/items", { method: "POST", body: JSON.stringify(line), sessionToken });
}

export function updateCartItem(sessionToken: string, lineId: string, quantity: number): Promise<Cart> {
  return request<Cart>(`/cart/items/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
    sessionToken,
  });
}

export function removeCartItem(sessionToken: string, lineId: string): Promise<Cart> {
  return request<Cart>(`/cart/items/${lineId}`, { method: "DELETE", sessionToken });
}
