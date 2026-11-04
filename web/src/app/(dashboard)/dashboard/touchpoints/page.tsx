"use client";

import { useState, type FormEvent } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { QrCode } from "@/components/qr/QrCode";
import { Button, Card, FormError, LinkButton, Pill, TextField } from "@/components/ui";
import { LOCAL_VENUE_NOTE } from "@/lib/demo";
import { READ_ONLY_NOTE } from "@/lib/demo-cloud/config";
import { DEFAULT_PICKUP_NAME } from "@/lib/industries";
import { downloadQrPdf } from "@/lib/qr/pdf";
import { touchpointUrl } from "@/lib/qr/url";
import { parseSpotCount, spotCountMessage, spotPlural } from "@/lib/service-setup";
import { useData } from "@/lib/use-data";
import { getServices, type Touchpoint } from "@/services";

async function load() {
  const { touchpoints } = getServices();
  const [list, setup, localOnly] = await Promise.all([
    touchpoints.list(),
    touchpoints.getSetup(),
    getServices().venues.isLocalOnly(),
  ]);
  return { list, spotType: setup.spotType, localOnly };
}

export default function TouchpointsPage() {
  const { venue, shared } = useDashboard();
  const { data, error, run } = useData(load);
  const [openId, setOpenId] = useState<string | null>(null);
  const [count, setCount] = useState("");
  const [countError, setCountError] = useState<string | undefined>();
  const [pickupName, setPickupName] = useState(DEFAULT_PICKUP_NAME);
  const [notice, setNotice] = useState("");
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (!data) return <FormError message={error} />;
  const { list, spotType, localOnly } = data;
  const services = getServices().touchpoints;
  const spots = list.filter((t) => t.serviceMode === "delivery");
  const pickups = list.filter((t) => t.serviceMode === "pickup");
  const active = list.filter((t) => t.active);
  const plural = spotPlural(spotType);

  async function addSpots(event: FormEvent) {
    event.preventDefault();
    const parsed = parseSpotCount(count);
    if (parsed === null) {
      setCountError(spotCountMessage());
      return;
    }
    setCountError(undefined);
    if (await run(() => services.addSpots(parsed))) {
      setCount("");
      setNotice(`Added ${parsed}. Download the PDF to print the new codes.`);
    }
  }

  async function addPickup(event: FormEvent) {
    event.preventDefault();
    if (await run(() => services.addPickup(pickupName))) setNotice(`Added ${pickupName.trim()}.`);
  }

  async function download() {
    setPdfError(null);
    try {
      await downloadQrPdf(venue, active, window.location.origin);
    } catch {
      setPdfError("The PDF couldn't be created. Try again.");
    }
  }

  function row(tp: Touchpoint) {
    const open = openId === tp.id;
    return (
      <li key={tp.id}>
        <Card className="py-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpenId(open ? null : tp.id)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left font-semibold text-ink"
          >
            <span className="min-w-0 truncate">{tp.label}</span>
            <Pill tone={tp.active ? "green" : "gray"}>{tp.active ? "Active" : "Inactive"}</Pill>
          </button>
          {open ? (
            <div className="space-y-3 pb-2">
              <QrCode
                value={touchpointUrl(window.location.origin, venue, tp)}
                label={`QR code for ${tp.label}`}
                className="mx-auto w-40"
              />
              <div className={shared ? "hidden" : "flex flex-wrap gap-2"}>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void run(() => services.regenerateQr(tp.id)).then(
                      (ok) => ok && setNotice(`New QR for ${tp.label}. Reprint it: the old code stops working.`),
                    )
                  }
                >
                  Regenerate QR
                </Button>
                <Button variant="secondary" onClick={() => void run(() => services.setActive(tp.id, !tp.active))}>
                  {tp.active ? "Deactivate" : "Reactivate"}
                </Button>
                {tp.serviceMode === "pickup" ? (
                  <Button variant="danger" onClick={() => void run(() => services.removePickup(tp.id))}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-black text-ink">Touchpoints & QR</h1>
        <p className="text-gray-600">{active.length} active {active.length === 1 ? "code" : "codes"}. Each one opens your menu at that spot.</p>
        <Button onClick={() => void download()} className="w-full sm:w-auto">Download printable PDF</Button>
        {localOnly ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-ink">{LOCAL_VENUE_NOTE}</p>
        ) : null}
      </div>
      {shared ? (
        <LinkButton href="/signup" variant="secondary" className="w-full sm:w-auto">{READ_ONLY_NOTE}</LinkButton>
      ) : null}
      <FormError message={error ?? pdfError} />
      <p role="status" className="text-sm font-medium text-brand-800">{notice}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-ink">{plural}</h2>
        {spots.length ? <ul className="space-y-2">{spots.map(row)}</ul> : <p className="text-gray-600">None yet.</p>}
        <form onSubmit={(e) => void addSpots(e)} noValidate className={shared ? "hidden" : "flex items-start gap-2 pt-2"}>
          <TextField
            label={`Add ${plural.toLowerCase()}: how many more?`}
            inputMode="numeric"
            className="flex-1"
            value={count}
            error={countError}
            onChange={(e) => setCount(e.target.value)}
          />
          <Button type="submit" variant="secondary" className="mt-6">Add {plural.toLowerCase()}</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Pickup points</h2>
        {pickups.length ? <ul className="space-y-2">{pickups.map(row)}</ul> : <p className="text-gray-600">None yet.</p>}
        <form onSubmit={(e) => void addPickup(e)} className={shared ? "hidden" : "flex items-end gap-2 pt-2"}>
          <TextField
            label="Pickup point name"
            className="flex-1"
            value={pickupName}
            onChange={(e) => setPickupName(e.target.value)}
          />
          <Button type="submit" variant="secondary">Add pickup point</Button>
        </form>
      </section>
    </div>
  );
}
