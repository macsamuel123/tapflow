import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      {children}
    </svg>
  );
}

export type NavItem = { href: string; label: string; icon: ReactNode };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: <Icon><path d="M3 12l9-8 9 8" /><path d="M5 10v10h14V10" /></Icon> },
  { href: "/dashboard/orders", label: "Orders", icon: <Icon><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Icon> },
  { href: "/dashboard/menu", label: "Menu", icon: <Icon><path d="M4 5h16M4 12h16M4 19h16" /></Icon> },
  { href: "/dashboard/touchpoints", label: "Touchpoints", icon: <Icon><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 20h2" /></Icon> },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/dashboard/staff", label: "Staff", icon: <Icon><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6" /><path d="M16 5a3.5 3.5 0 010 6.5M18 14c2 .8 3 3 3 6" /></Icon> },
  { href: "/dashboard/payments", label: "Payments", icon: <Icon><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></Icon> },
  { href: "/dashboard/settings", label: "Settings", icon: <Icon><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></Icon> },
];

export const MORE_ICON = <Icon><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>;
