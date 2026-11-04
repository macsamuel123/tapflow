import { NotLive } from "@/components/ui";
import { Logo } from "@/components/ui/Logo";
import { DEMO_MODE } from "@/lib/demo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  if (!DEMO_MODE) return <NotLive />;
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <Logo />
      <main className="mt-6">{children}</main>
    </div>
  );
}
