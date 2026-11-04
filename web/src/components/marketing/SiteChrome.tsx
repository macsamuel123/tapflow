import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { LinkButton } from "@/components/ui";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <Link href="/pricing" className="px-1.5 py-2 text-sm font-medium whitespace-nowrap text-gray-700 hover:text-ink sm:px-2">Pricing</Link>
          <Link href="/login" className="px-1.5 py-2 text-sm font-medium whitespace-nowrap text-gray-700 hover:text-ink sm:px-2">Log in</Link>
          <LinkButton href="/signup" className="whitespace-nowrap">Get started</LinkButton>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-100 bg-gray-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-gray-600 sm:flex-row sm:items-center">
        <p><span className="font-semibold text-ink">TapFlow.</span> Scan. Order. Serve.</p>
        <nav aria-label="Footer" className="flex gap-4 sm:ml-auto">
          <Link href="/pricing" className="hover:text-ink">Pricing</Link>
          <Link href="/login" className="hover:text-ink">Log in</Link>
          <Link href="/signup" className="hover:text-ink">Sign up</Link>
        </nav>
      </div>
    </footer>
  );
}
