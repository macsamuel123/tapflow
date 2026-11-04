import { ServiceError } from "@/services/types";
import type {
  MenuCategory,
  Order,
  PaymentStatus,
  Session,
  ServiceSetup,
  StaffMember,
  TaxRate,
  Touchpoint,
  Venue,
} from "@/services/types";
import { demoBrewery, demoFoodTruck } from "./fixtures";

export type Workspace = {
  id: string;
  venue: Venue;
  spotType: ServiceSetup["spotType"];
  touchpoints: Touchpoint[];
  orders: Order[];
  menu: MenuCategory[];
  staff: StaffMember[];
  payment: PaymentStatus;
  taxes: TaxRate[];
  /** True until the sample menu is cleared, so the button stays available after edits. */
  sampleMenu: boolean;
};

export type DemoState = {
  session: Session | null;
  activeId: string;
  workspaces: Workspace[];
};

// Passwords are never kept. Bump the version when the shape of the state changes.
const STORAGE_KEY = "tapflow:demo:v2";

function freshWorkspaces(): Workspace[] {
  return [demoBrewery(), demoFoodTruck()];
}

function freshState(session: Session | null = null): DemoState {
  const workspaces = freshWorkspaces();
  return { session, activeId: workspaces[0]!.id, workspaces };
}

export function readState(): DemoState {
  if (typeof window === "undefined") return freshState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    // Unavailable or corrupted storage: start from the sample data.
  }
  return freshState();
}

export function writeState(state: DemoState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      throw new ServiceError("This browser's demo storage is full. Reset the demo in Settings to free it up.");
    }
    // Private browsing: the demo still runs, but changes last only for this page.
  }
}

export function update(change: (state: DemoState) => void): void {
  const state = readState();
  change(state);
  writeState(state);
}

export function activeWorkspace(state: DemoState): Workspace {
  const found = state.workspaces.find((w) => w.id === state.activeId) ?? state.workspaces[0];
  if (!found) throw new Error("Demo state has no workspaces");
  return found;
}

export function updateActive(change: (workspace: Workspace) => void): void {
  update((state) => change(activeWorkspace(state)));
}

export function resetState(): void {
  const { session } = readState();
  writeState(freshState(session));
}
