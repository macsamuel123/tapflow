"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ServiceSetupFields, type SetupForm } from "@/components/setup/ServiceSetupFields";
import { Button, FormError, SelectField, TextField } from "@/components/ui";
import { defaultSetup, findIndustry, INDUSTRIES } from "@/lib/industries";
import { COUNTRIES, REGIONS } from "@/lib/regions";
import { parseSpotCount, validateSetup } from "@/lib/service-setup";
import { emailError, passwordError } from "@/lib/validation";
import { getServices } from "@/services";
import { ServiceError, type CountryCode, type IndustryId } from "@/services/types";

const DRAFT_KEY = "tapflow:signup-draft";
const STEP_COUNT = 4;

// Passwords are left out so they never reach browser storage.
type Draft = {
  industry: IndustryId | null;
  name: string;
  email: string;
  venueName: string;
  country: CountryCode;
  region: string;
  setup: SetupForm;
};

function setupFor(industry: IndustryId | null): SetupForm {
  const setup = defaultSetup(findIndustry(industry));
  return { ...setup, spotCount: String(setup.spotCount) };
}

function blankDraft(industry: IndustryId | null): Draft {
  return {
    industry,
    name: "",
    email: "",
    venueName: "",
    country: "CA",
    region: "",
    setup: setupFor(industry),
  };
}

function loadDraft(fromUrl: IndustryId | null): Draft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as Draft) : null;
    if (draft && (!fromUrl || draft.industry === fromUrl)) return draft;
  } catch {
    // Unavailable storage: start clean.
  }
  return blankDraft(fromUrl);
}

export function SignupWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = findIndustry(params.get("industry"))?.id ?? null;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(fromUrl));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [attempted, setAttempted] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const accountErrors = {
    name: draft.name.trim() ? undefined : "Enter your name.",
    email: emailError(draft.email),
    password: passwordError(password),
    confirm: confirm === password ? undefined : "Passwords don't match.",
  };
  const venueErrors = {
    venueName: draft.venueName.trim() ? undefined : "Enter your venue name.",
    region: draft.region ? undefined : "Choose one.",
  };
  const setupErrors = validateSetup(draft.setup, draft.setup.spotCount);
  const complete = [
    draft.industry !== null,
    !Object.values(accountErrors).some(Boolean),
    !Object.values(venueErrors).some(Boolean),
    Object.keys(setupErrors).length === 0,
  ];

  // A step can't be reached by URL or reload until the ones before it are complete.
  const requested = Number(params.get("step") ?? "1");
  const firstIncomplete = complete.findIndex((done) => !done);
  const ceiling = firstIncomplete < 0 ? STEP_COUNT : firstIncomplete + 1;
  const step = Math.min(Number.isInteger(requested) && requested >= 1 ? requested : 1, ceiling, STEP_COUNT);
  const showErrors = attempted === step;

  function patch(change: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...change }));
  }

  function chooseIndustry(industry: IndustryId) {
    setDraft((d) => (d.industry === industry ? d : { ...d, industry, setup: setupFor(industry) }));
  }

  function goTo(next: number) {
    setAttempted(0);
    setFormError(null);
    const query = new URLSearchParams({ step: String(next) });
    if (draft.industry) query.set("industry", draft.industry);
    router.push(`/signup?${query.toString()}`);
  }

  async function submit() {
    const spotCount = parseSpotCount(draft.setup.spotCount) ?? 0;
    if (!draft.industry) return;
    setBusy(true);
    setFormError(null);
    try {
      await getServices().auth.signUp({
        industry: draft.industry,
        name: draft.name,
        email: draft.email,
        password,
        venueName: draft.venueName,
        country: draft.country,
        region: draft.region,
        setup: { ...draft.setup, spotCount },
      });
      window.sessionStorage.removeItem(DRAFT_KEY);
      router.push("/signup/ready");
    } catch (err) {
      setFormError(err instanceof ServiceError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!complete[step - 1]) {
      setAttempted(step);
      return;
    }
    if (step === STEP_COUNT) void submit();
    else goTo(step + 1);
  }

  const country = COUNTRIES.find((c) => c.code === draft.country) ?? COUNTRIES[0]!;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-brand-700">Step {step} of {STEP_COUNT}</p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-brand-700" : "bg-gray-200"}`} />
          ))}
        </div>
      </div>

      {step === 1 ? (
        <fieldset className="space-y-3">
          <legend className="text-2xl font-black text-ink">What kind of venue do you run?</legend>
          <div className="grid gap-2 pt-2">
            {INDUSTRIES.map((industry) => {
              const selected = draft.industry === industry.id;
              return (
                <label
                  key={industry.id}
                  className={
                    "flex min-h-12 cursor-pointer items-center rounded-xl border px-4 py-2 font-medium " +
                    "has-focus-visible:outline-2 has-focus-visible:outline-brand-700 " +
                    (selected ? "border-brand-700 bg-brand-50 text-brand-800" : "border-gray-300 text-ink")
                  }
                >
                  <input
                    type="radio"
                    name="industry"
                    className="sr-only"
                    checked={selected}
                    onChange={() => chooseIndustry(industry.id)}
                  />
                  {industry.name}
                </label>
              );
            })}
          </div>
          {showErrors ? <FormError message="Choose your venue type to continue." /> : null}
        </fieldset>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-black text-ink">Create your account</h1>
          <TextField
            label="Your name"
            autoComplete="name"
            value={draft.name}
            error={showErrors ? accountErrors.name : undefined}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={draft.email}
            error={showErrors ? accountErrors.email : undefined}
            onChange={(e) => patch({ email: e.target.value })}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            hint="At least 8 characters"
            error={showErrors ? accountErrors.password : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            error={showErrors ? accountErrors.confirm : undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-black text-ink">Tell us about your venue</h1>
          <TextField
            label="Venue name"
            autoComplete="organization"
            maxLength={120}
            value={draft.venueName}
            error={showErrors ? venueErrors.venueName : undefined}
            onChange={(e) => patch({ venueName: e.target.value })}
          />
          <SelectField
            label="Country"
            value={draft.country}
            onChange={(e) => patch({ country: e.target.value as CountryCode, region: "" })}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </SelectField>
          <SelectField
            label={country.regionLabel}
            value={draft.region}
            error={showErrors ? venueErrors.region : undefined}
            onChange={(e) => patch({ region: e.target.value })}
          >
            <option value="">Choose one</option>
            {REGIONS[draft.country].map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </SelectField>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-black text-ink">How do guests get their order?</h1>
          <ServiceSetupFields
            value={draft.setup}
            errors={showErrors ? setupErrors : {}}
            onChange={(change) => patch({ setup: { ...draft.setup, ...change } })}
          />
        </div>
      ) : null}

      <FormError message={formError} />

      <div className="flex gap-2">
        {step > 1 ? (
          <Button variant="secondary" onClick={() => router.back()}>Back</Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={busy}>
          {step === STEP_COUNT ? "Create my QR codes" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
