import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-bold tracking-tight text-ink">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-lg bg-brand-700 text-sm font-black text-white"
      >
        T
      </span>
      TapFlow
    </Link>
  );
}
