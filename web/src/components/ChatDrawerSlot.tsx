// Phase 2 extension point (AI waiter — PLAN.md §10).
// Mounted on the diner menu page from M2. Renders nothing until the feature flag is set;
// in Phase 2 it will lazy-load the chat drawer with next/dynamic so the MVP bundle is unaffected.
export function ChatDrawerSlot(): React.ReactNode {
  if (process.env.NEXT_PUBLIC_FEATURE_CHAT !== "1") return null;
  return null;
}
