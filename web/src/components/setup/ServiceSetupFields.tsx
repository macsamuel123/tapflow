"use client";

import { SelectField, TextField, YesNo } from "@/components/ui";
import {
  MAX_PICKUP_NAME,
  MAX_SPOTS,
  MIN_SPOTS,
  SPOT_TYPES,
  setupPreview,
  spotLabel,
  type SetupErrors,
} from "@/lib/service-setup";
import type { ServiceSetup } from "@/services/types";

/** spotCount stays as typed, so invalid input can be shown and rejected rather than coerced. */
export type SetupForm = Omit<ServiceSetup, "spotCount"> & { spotCount: string };

export function ServiceSetupFields({
  value,
  errors,
  onChange,
}: {
  value: SetupForm;
  errors: SetupErrors;
  onChange: (patch: Partial<SetupForm>) => void;
}) {
  const preview = setupPreview(value.spotsEnabled, value.spotType, value.spotCount, value.pickupEnabled);
  return (
    <div className="space-y-5">
      <YesNo
        legend="Do guests sit at tables or spots?"
        name="spots-enabled"
        value={value.spotsEnabled}
        onChange={(spotsEnabled) => onChange({ spotsEnabled })}
      />
      {value.spotsEnabled ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="How many?"
            inputMode="numeric"
            autoComplete="off"
            value={value.spotCount}
            error={errors.spotCount}
            hint={`${MIN_SPOTS} to ${MAX_SPOTS}`}
            onChange={(e) => onChange({ spotCount: e.target.value })}
          />
          <SelectField
            label="Spot type"
            value={value.spotType}
            onChange={(e) => onChange({ spotType: e.target.value as SetupForm["spotType"] })}
          >
            {SPOT_TYPES.map((type) => (
              <option key={type} value={type}>{spotLabel(type)}</option>
            ))}
          </SelectField>
        </div>
      ) : null}

      <YesNo
        legend="Do you also have a pickup counter or window?"
        name="pickup-enabled"
        value={value.pickupEnabled}
        onChange={(pickupEnabled) => onChange({ pickupEnabled })}
      />
      {value.pickupEnabled ? (
        <TextField
          label="Pickup point name"
          maxLength={MAX_PICKUP_NAME + 10}
          value={value.pickupName}
          error={errors.pickupName}
          onChange={(e) => onChange({ pickupName: e.target.value })}
        />
      ) : null}

      {errors.choice ? (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {errors.choice}
        </p>
      ) : null}
      <p role="status" className="rounded-xl bg-brand-50 px-3 py-3 text-sm font-semibold text-brand-800">
        {preview ?? "Your QR code count will appear here."}
      </p>
    </div>
  );
}
