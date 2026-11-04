"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QrCode } from "@/components/qr/QrCode";
import { Button, FormError, LinkButton } from "@/components/ui";
import { LOCAL_VENUE_NOTE } from "@/lib/demo";
import { downloadQrPdf } from "@/lib/qr/pdf";
import { touchpointUrl } from "@/lib/qr/url";
import { getServices, type Touchpoint, type Venue } from "@/services";

const PREVIEW_COUNT = 6;

export default function QrReadyPage() {
  const router = useRouter();
  const [data, setData] = useState<{ venue: Venue; touchpoints: Touchpoint[]; origin: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const services = getServices();
      if (!(await services.auth.getSession())) {
        router.replace("/signup");
        return;
      }
      const [venue, touchpoints] = await Promise.all([services.venues.current(), services.touchpoints.list()]);
      setData({ venue, touchpoints: touchpoints.filter((t) => t.active), origin: window.location.origin });
    })();
  }, [router]);

  if (!data) return <p role="status" className="text-gray-600">Loading your QR codes...</p>;
  const { venue, touchpoints, origin } = data;

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await downloadQrPdf(venue, touchpoints, origin);
    } catch {
      setError("The PDF couldn't be created. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const extra = touchpoints.length - PREVIEW_COUNT;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Your QR codes are ready</h1>
        <p className="mt-1 text-gray-600">
          {touchpoints.length} {touchpoints.length === 1 ? "code" : "codes"} for {venue.name}. Print
          the sheet and place each code at its spot.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {touchpoints.slice(0, PREVIEW_COUNT).map((tp) => (
          <li key={tp.id} className="rounded-xl border border-gray-200 p-2 text-center">
            <QrCode value={touchpointUrl(origin, venue, tp)} label={`QR code for ${tp.label}`} className="w-full" />
            <p className="mt-1 text-sm font-semibold text-ink">{tp.label}</p>
          </li>
        ))}
      </ul>
      {extra > 0 ? <p className="text-sm text-gray-600">Plus {extra} more on the sheet.</p> : null}
      <p role="note" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-ink">{LOCAL_VENUE_NOTE}</p>
      <FormError message={error} />
      <div className="grid gap-2">
        <Button onClick={() => void download()} disabled={busy}>
          {busy ? "Preparing PDF..." : "Download printable PDF"}
        </Button>
        <LinkButton href="/dashboard" variant="secondary">Continue to dashboard</LinkButton>
      </div>
    </div>
  );
}
