import { LinkButton } from "@/components/ui";
import { INVITE_NOTE } from "@/lib/staff/permissions";

export default function InvitePage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-black text-ink">You&apos;ve been invited</h1>
      <p role="note" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-ink">
        This is a demo invite link. {INVITE_NOTE}.
      </p>
      <LinkButton href="/" variant="secondary">Back to home</LinkButton>
    </div>
  );
}
