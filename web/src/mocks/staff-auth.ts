// Demo-only PIN hashing and device sessions. The cloud keeps PINs as a peppered HMAC on the
// server. This browser-only stand-in still never stores a raw PIN.
import { LOCK_MS, LOGIN_TRIES } from "@/lib/staff/permissions";

/** FNV-1a over the PIN, twice with different seeds. Not secret: demo data only. Uniqueness is
 *  per venue, checked against that venue's own staff list. */
export function mockPinHash(pin: string): string {
  const text = `tapflow-demo:${pin}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `fnv:${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

type Lock = { failures: number; lockedUntil: number };

function lockKey(slug: string): string {
  return `tapflow:staff-lock:${slug}`;
}

function readLock(slug: string): Lock {
  try {
    const raw = window.localStorage.getItem(lockKey(slug));
    if (raw) return JSON.parse(raw) as Lock;
  } catch {
    // Unavailable storage: no lock to read.
  }
  return { failures: 0, lockedUntil: 0 };
}

function writeLock(slug: string, lock: Lock): void {
  try {
    window.localStorage.setItem(lockKey(slug), JSON.stringify(lock));
  } catch {
    // Private browsing: the lock lasts for this page only.
  }
}

export function isLocked(slug: string, now = Date.now()): boolean {
  return readLock(slug).lockedUntil > now;
}

/** Counts a wrong PIN. The fifth locks the venue's PIN login for a minute. Returns tries left. */
export function recordFailure(slug: string, now = Date.now()): number {
  const lock = readLock(slug);
  const failures = lock.failures + 1;
  if (failures >= LOGIN_TRIES) {
    writeLock(slug, { failures: 0, lockedUntil: now + LOCK_MS });
    return 0;
  }
  writeLock(slug, { failures, lockedUntil: lock.lockedUntil });
  return LOGIN_TRIES - failures;
}

export function clearFailures(slug: string): void {
  writeLock(slug, { failures: 0, lockedUntil: 0 });
}

type DeviceSession = { staffId: string; pinVersion: number };

function sessionKey(slug: string): string {
  return `tapflow:staff-session:${slug}`;
}

/** One sign-in per tab, like the cloud's staff token. */
export function readDeviceSession(slug: string): DeviceSession | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey(slug));
    return raw ? (JSON.parse(raw) as DeviceSession) : null;
  } catch {
    return null;
  }
}

export function writeDeviceSession(slug: string, session: DeviceSession | null): void {
  try {
    if (session) window.sessionStorage.setItem(sessionKey(slug), JSON.stringify(session));
    else window.sessionStorage.removeItem(sessionKey(slug));
  } catch {
    // Unavailable storage: the sign-in lasts for this page only.
  }
}
