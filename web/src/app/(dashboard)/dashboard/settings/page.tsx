"use client";

import { useState, type FormEvent } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { ServiceSetupFields, toServiceSetup, type SetupForm } from "@/components/setup/ServiceSetupFields";
import { Button, Card, FormError, LinkButton, SelectField, TextField } from "@/components/ui";
import { DEMO_CLOUD, READ_ONLY_NOTE } from "@/lib/demo-cloud/config";
import { formatBps } from "@/lib/percent";
import { COUNTRIES, REGIONS } from "@/lib/regions";
import { parseSpotCount, validateSetup, type SetupErrors } from "@/lib/service-setup";
import { useData } from "@/lib/use-data";
import { getServices, ServiceError, type CountryCode, type TaxRate, type Venue } from "@/services";

function VenueDetails({ venue }: { venue: Venue }) {
  const { refresh } = useDashboard();
  const [name, setName] = useState(venue.name);
  const [country, setCountry] = useState<CountryCode>(venue.country);
  const [region, setRegion] = useState(venue.region);
  const [error, setError] = useState<string | undefined>();
  const regionLabel = COUNTRIES.find((c) => c.code === country)?.regionLabel ?? "Region";

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !region) {
      setError(name.trim() ? `Choose a ${regionLabel.toLowerCase()}.` : "Enter a venue name.");
      return;
    }
    setError(undefined);
    await getServices().venues.updateDetails({ name, country, region });
    await refresh();
  }

  return (
    <Card>
      <form onSubmit={(e) => void save(e)} noValidate className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Venue details</h2>
        <TextField label="Venue name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <SelectField
          label="Country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value as CountryCode);
            setRegion("");
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </SelectField>
        <SelectField label={regionLabel} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Choose one</option>
          {REGIONS[country].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </SelectField>
        <FormError message={error ?? null} />
        <Button type="submit">Save details</Button>
      </form>
    </Card>
  );
}

function ServiceSetupCard({ initial }: { initial: SetupForm }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<SetupErrors>({});
  const [saved, setSaved] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = validateSetup(form, form.spotCount);
    setErrors(found);
    setSaved("");
    setSaveError(null);
    if (Object.keys(found).length > 0) return;
    try {
      await getServices().touchpoints.applySetup(toServiceSetup(form, parseSpotCount(form.spotCount) ?? 0));
      setSaved("Saved. Touchpoints are updated.");
    } catch (err) {
      setSaveError(err instanceof ServiceError ? err.message : "Something went wrong. Try again.");
    }
  }

  return (
    <Card>
      <form onSubmit={(e) => void save(e)} noValidate className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Service setup</h2>
        <ServiceSetupFields
          value={form}
          errors={errors}
          onChange={(change) => {
            setForm((f) => ({ ...f, ...change }));
            setSaved("");
          }}
        />
        <FormError message={saveError} />
        <Button type="submit">Save service setup</Button>
        <p role="status" className="text-sm font-medium text-brand-800">{saved}</p>
      </form>
    </Card>
  );
}

function Taxes({ taxes }: { taxes: TaxRate[] }) {
  return (
    <Card>
      <h2 className="text-lg font-bold text-ink">Taxes</h2>
      <ul className="mt-2 space-y-1">
        {taxes.map((tax) => (
          <li key={tax.code} className="flex justify-between gap-2">
            <span className="text-gray-700">{tax.code} · {tax.name}</span>
            <span className="font-semibold text-ink">{formatBps(tax.rateBps)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-gray-500">Sample rates. Tax setup comes later.</p>
    </Card>
  );
}

async function load() {
  const { touchpoints, venues } = getServices();
  const [setup, taxes] = await Promise.all([touchpoints.getSetup(), venues.getTaxes()]);
  return { setup, taxes };
}

export default function SettingsPage() {
  const { venue, refresh, shared } = useDashboard();
  const { data, error } = useData(load);

  async function reset() {
    await getServices().venues.resetDemo();
    await refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-ink">Settings</h1>
      <FormError message={error} />
      {shared ? (
        <Card className="space-y-2 bg-brand-50">
          <p className="text-sm text-ink">This shared demo venue is read-only.</p>
          <LinkButton href="/signup" variant="secondary">{READ_ONLY_NOTE}</LinkButton>
        </Card>
      ) : (
        <VenueDetails venue={venue} />
      )}
      {data ? (
        <>
          {shared ? null : <ServiceSetupCard initial={{ ...data.setup, spotCount: String(data.setup.spotCount || 12) }} />}
          <Taxes taxes={data.taxes} />
        </>
      ) : null}
      <Card className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Demo</h2>
        <p className="text-gray-600">
          {DEMO_CLOUD
            ? "Put the demo venues' sample data back. Venues you saved in the cloud are kept."
            : "Put the sample data back and remove the venue you signed up with."}
        </p>
        <Button variant="danger" onClick={() => void reset()}>Reset demo</Button>
      </Card>
    </div>
  );
}
