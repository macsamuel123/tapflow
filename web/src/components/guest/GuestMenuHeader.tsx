import type { ReactNode } from "react";
import type { Branding } from "@/services/types";

/** The top of the guest menu: cover, logo and name. Shared with the Profile page preview. */
export function GuestMenuHeader({
  name,
  touchpointLabel,
  branding,
  children,
}: {
  name: string;
  touchpointLabel: string | null;
  branding: Branding;
  children?: ReactNode;
}) {
  return (
    <div data-testid="guest-header">
      {branding.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- may be a local blob URL, which next/image can't optimise
        <img src={branding.coverUrl} alt={`${name} cover`} className="h-28 w-full object-cover" />
      ) : null}
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 pt-4 pb-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- may be a local blob URL
              <img src={branding.logoUrl} alt={`${name} logo`} className="size-10 shrink-0 rounded-lg object-cover" />
            ) : null}
            <h1 className="truncate text-xl font-bold">{name}</h1>
          </div>
          {touchpointLabel ? <span className="shrink-0 text-sm text-gray-600">{touchpointLabel}</span> : null}
        </div>
        <span aria-hidden className="mt-2 block h-1 rounded-full brand-button" />
        {children}
      </header>
    </div>
  );
}
