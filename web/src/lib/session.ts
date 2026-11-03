import { ApiError, createSession, getSession } from "./api-client";

export type ActiveSession = {
  token: string;
  verified: boolean;
  tableId: string | null;
  tableLabel: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function key(slug: string): string {
  return `table-order:session:${slug}`;
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
 * Reuse the stored session for this table if the API still accepts it, otherwise start one.
 * A fresh QR token in the URL upgrades a browse-only session (a new verified session).
 * Whether a session is verified is decided by the API alone.
 */
export async function ensureSession(
  slug: string,
  rawTableId: string,
  qrToken: string | null,
): Promise<ActiveSession> {
  const tableId = UUID_RE.test(rawTableId) ? rawTableId : null;
  const stored = load(slug);

  if (stored && stored.tableId === tableId && (stored.verified || !qrToken)) {
    try {
      const s = await getSession(stored.token);
      const active = { ...stored, verified: s.verified, tableLabel: s.table_label };
      save(slug, active);
      return active;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err;
      // Expired or unknown: fall through and start a new one.
    }
  }

  const created = await createSession({ restaurant_slug: slug, table_id: tableId, token: qrToken });
  const active: ActiveSession = {
    token: created.session_token,
    verified: created.verified,
    tableId: created.table_id ?? tableId,
    tableLabel: created.table_label,
  };
  save(slug, active);
  return active;
}
