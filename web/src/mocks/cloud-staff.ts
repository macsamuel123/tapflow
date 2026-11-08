// Staff, branding and staff mode in the shared demo. A tester's venue keeps its staff in the
// cloud: every change needs the recovery code, and staff devices sign in with a PIN for a signed
// token that the server re-checks, with the role re-read, on every request. The fixed demo
// venues have no cloud staff, so their Staff and Profile pages stay read-only samples.
import {
  deleteJson,
  fetchStaffVenue,
  getJson,
  patchJson,
  postJson,
  sendImage,
  staffRequest,
} from "@/lib/demo-cloud/browser";
import { READ_ONLY_NOTE, type DemoOrderRow } from "@/lib/demo-cloud/config";
import { LOCKED_MESSAGE, withDefaultLabels } from "@/lib/staff/permissions";
import { ServiceError } from "@/services/types";
import type {
  Branding,
  BrandingService,
  MenuCategory,
  Order,
  RoleLabels,
  StaffMember,
  StaffModeService,
  StaffService,
  StaffSession,
  Touchpoint,
} from "@/services/types";
import { update, type Workspace } from "./store";

type Context = {
  active: () => Workspace;
  inFixedDemo: () => boolean;
  toOrder: (row: DemoOrderRow) => Order;
};

type Listing = { staff: StaffMember[]; roleLabels: RoleLabels };

function readOnly(): ServiceError {
  return new ServiceError(`${READ_ONLY_NOTE}.`);
}

export function cloudStaff(mock: StaffService, { active, inFixedDemo }: Context): StaffService {
  function cloud() {
    const { cloud } = active();
    if (!cloud || inFixedDemo()) throw readOnly();
    return { path: `/demo/api/venues/${cloud.venueId}/staff`, code: cloud.code };
  }
  /** The person who signed up isn't a cloud row: their details never leave this browser. */
  function withAccountOwner(listing: Listing): StaffMember[] {
    const owners = active().staff.filter((s) => s.accountOwner).map((s) => ({
      id: s.id, name: s.name, role: s.role, active: true, hasPin: false, accountOwner: true,
    }));
    return [...owners, ...listing.staff];
  }
  function remember(listing: Listing): Listing {
    update((state) => {
      const workspace = state.workspaces.find((w) => w.id === active().id);
      if (workspace) workspace.roleLabels = listing.roleLabels;
    });
    return listing;
  }
  const isCloud = () => active().cloud !== undefined && !inFixedDemo();

  return {
    async list() {
      if (!isCloud()) return mock.list();
      const { path, code } = cloud();
      return withAccountOwner(remember(await getJson<Listing>(path, code)));
    },
    async add(member) {
      const { path, code } = cloud();
      const listing = remember(await postJson<Listing>(path, member, code));
      const added = listing.staff.at(-1);
      if (!added) throw new ServiceError("Something went wrong. Try again.");
      return added;
    },
    async setRole(id, role, pin) {
      const { path, code } = cloud();
      remember(await patchJson<Listing>(path, { op: "set_role", id, role, pin: pin ?? null }, code));
    },
    async resetPin(id, pin) {
      const { path, code } = cloud();
      remember(await patchJson<Listing>(path, { op: "reset_pin", id, pin }, code));
    },
    async deactivate(id) {
      const { path, code } = cloud();
      remember(await patchJson<Listing>(path, { op: "deactivate", id }, code));
    },
    async roleLabels() {
      if (!isCloud()) return mock.roleLabels();
      const { path, code } = cloud();
      return remember(await getJson<Listing>(path, code)).roleLabels;
    },
    async renameRole(role, label) {
      const { path, code } = cloud();
      remember(await patchJson<Listing>(path, { op: "rename_role", role, label }, code));
    },
  };
}

export function cloudBranding(mock: BrandingService, { active, inFixedDemo }: Context, pull: () => Promise<void>): BrandingService {
  function cloud() {
    const { cloud } = active();
    if (!cloud || inFixedDemo()) throw readOnly();
    return { path: `/demo/api/venues/${cloud.venueId}/branding`, code: cloud.code };
  }
  function store(branding: Branding): void {
    update((state) => {
      const workspace = state.workspaces.find((w) => w.id === active().id);
      if (workspace) workspace.branding = branding;
    });
  }
  return {
    async get() {
      if (active().cloud && !inFixedDemo()) await pull().catch(() => undefined);
      return mock.get();
    },
    async saveColor(color) {
      const { path, code } = cloud();
      store((await postJson<{ branding: Branding }>(path, { color }, code)).branding);
      return mock.get();
    },
    async upload(kind, image) {
      const { path, code } = cloud();
      store((await sendImage<{ branding: Branding }>(`${path}/${kind}`, image, code)).branding);
    },
    async remove(kind) {
      const { path, code } = cloud();
      store((await deleteJson<{ branding: Branding }>(`${path}/${kind}`, code)).branding);
    },
  };
}

function tokenKey(slug: string): string {
  return `tapflow:staff-token:${slug}`;
}

/** One sign-in per tab, so two staff can share a browser in separate tabs. */
function readToken(slug: string): string | null {
  try {
    return window.sessionStorage.getItem(tokenKey(slug));
  } catch {
    return null;
  }
}

function writeToken(slug: string, token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(tokenKey(slug), token);
    else window.sessionStorage.removeItem(tokenKey(slug));
  } catch {
    // Unavailable storage: the sign-in lasts for this page only.
  }
}

type LoginBody = { status: string; token?: string; session?: StaffSession; triesLeft?: number };

export function cloudStaffMode({ toOrder }: Context): StaffModeService {
  async function view<T>(slug: string, kind: string): Promise<T> {
    const { status, body } = await staffRequest<T>(`/demo/api/staff/view?slug=${encodeURIComponent(slug)}&kind=${kind}`, {
      token: readToken(slug),
    });
    if (status !== 200) throw new ServiceError(body.error ?? "Something went wrong. Please try again.");
    return body;
  }
  async function post(slug: string, path: string, payload: unknown): Promise<void> {
    const { status, body } = await staffRequest<object>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      token: readToken(slug),
    });
    if (status !== 200) throw new ServiceError(body.error ?? "Something went wrong. Please try again.");
  }

  return {
    async venue(slug) {
      const venue = await fetchStaffVenue(slug);
      return venue ? { name: venue.name, roleLabels: withDefaultLabels(venue.role_labels) } : null;
    },
    async login(slug, pin) {
      const { status, body } = await staffRequest<LoginBody>("/demo/api/staff/login", {
        method: "POST",
        body: JSON.stringify({ slug, pin }),
      });
      if (status === 404) return { status: "no_venue" };
      if (status === 423) return { status: "locked" };
      if (status === 401) return { status: "wrong_pin", triesLeft: body.triesLeft ?? 0 };
      if (status !== 200 || !body.token || !body.session) {
        throw new ServiceError(body.error ?? LOCKED_MESSAGE);
      }
      writeToken(slug, body.token);
      return { status: "ok", session: body.session };
    },
    async logout(slug) {
      writeToken(slug, null);
    },
    async current(slug) {
      const token = readToken(slug);
      if (!token) return null;
      const { status, body } = await staffRequest<{ session?: StaffSession }>(
        `/demo/api/staff/me?slug=${encodeURIComponent(slug)}`,
        { token },
      );
      if (status === 401 || status === 404) {
        writeToken(slug, null);
        return null;
      }
      if (status !== 200 || !body.session) throw new ServiceError(body.error ?? "Something went wrong. Please try again.");
      return body.session;
    },
    async orders(slug) {
      return (await view<{ orders: DemoOrderRow[] }>(slug, "orders")).orders.map(toOrder);
    },
    async menu(slug) {
      return (await view<{ menu: MenuCategory[] }>(slug, "menu")).menu;
    },
    async touchpoints(slug) {
      return (await view<{ touchpoints: Touchpoint[] }>(slug, "touchpoints")).touchpoints;
    },
    async setStatus(slug, orderId, status) {
      await post(slug, `/demo/api/orders/${orderId}/status`, { status });
    },
    async setSoldOut(slug, itemId, soldOut) {
      await post(slug, "/demo/api/stock", { slug, itemId, soldOut });
    },
  };
}
