import { ApiError, createSession, getSession } from "./api-client";
import type { TouchpointKind } from "./api-types";

export type ActiveSession = {
  token: string;
  verified: boolean;
  touchpointId: string | null;
  touchpointLabel: string | null;
  touchpointKind: TouchpointKind | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function key(slug: string): string {
  return `tapflow:session:${slug}`;
}

function load(slug: string): ActiveSession | null {
  try {
    const raw = window.localStorage.getItem(key(slug));
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}

function save(slug: string, s: ActiveSession): void {
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(s));
  } catch {
    // Private mode etc.: the session still works for this page view.
  }
}

/**
 * Reuse the stored session for this touchpoint if the API still accepts it, otherwise start one.
 * A fresh QR token in the URL upgrades a browse-only session (a new verified session).
 * Whether a session is verified is decided by the API alone.
 */
export async function ensureSession(
  slug: string,
  rawTouchpointId: string,
  qrToken: string | null,
): Promise<ActiveSession> {
  const touchpointId = UUID_RE.test(rawTouchpointId) ? rawTouchpointId : null;
  const stored = load(slug);

  if (stored && stored.touchpointId === touchpointId && (stored.verified || !qrToken)) {
    try {
      const s = await getSession(stored.token);
      const active: ActiveSession = {
        ...stored,
        verified: s.verified,
        touchpointLabel: s.touchpoint_label,
        touchpointKind: s.touchpoint_kind,
      };
      save(slug, active);
      return active;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err;
      // Expired or unknown: fall through and start a new one.
    }
  }

  const created = await createSession({
    venue_slug: slug,
    touchpoint_id: touchpointId,
    token: qrToken,
  });
  const active: ActiveSession = {
    token: created.session_token,
    verified: created.verified,
    touchpointId: created.touchpoint_id ?? touchpointId,
    touchpointLabel: created.touchpoint_label,
    touchpointKind: created.touchpoint_kind,
  };
  save(slug, active);
  return active;
}
