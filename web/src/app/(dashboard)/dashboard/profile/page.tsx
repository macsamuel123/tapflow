"use client";

import { useState, type FormEvent } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { GuestMenuHeader } from "@/components/guest/GuestMenuHeader";
import { ImageUpload } from "@/components/ImageUpload";
import { Button, Card, FormError, TextField } from "@/components/ui";
import { contrastRatio, ensureAA, normalizeHex, textOn } from "@/lib/brand/contrast";
import { brandStyle } from "@/lib/brand/style";
import { useData } from "@/lib/use-data";
import { getServices, type Branding, type BrandImage } from "@/services";

const LOGO_EDGE = 512;
const COVER_EDGE = 1600;
const DEFAULT_COLOR = "#0a6657";

function ColorCard({ initial, onPreview, run }: {
  initial: string | null;
  onPreview: (color: string | null) => void;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [hex, setHex] = useState(initial ?? "");
  const [saved, setSaved] = useState("");
  const normalized = normalizeHex(hex);
  const safe = normalized ? ensureAA(normalized) : null;
  const error = hex.trim() && !normalized ? "Enter a colour like #1d4ed8." : null;

  function change(value: string) {
    setHex(value);
    setSaved("");
    const next = normalizeHex(value);
    onPreview(next ? ensureAA(next).color : null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (error) return;
    if (await run(() => getServices().branding.saveColor(safe?.color ?? null))) {
      setSaved(safe ? `Saved ${safe.color}.` : "Saved. Guests see the TapFlow colours.");
      if (safe?.adjusted) setHex(safe.color);
    }
  }

  return (
    <Card>
      <form onSubmit={(e) => void save(e)} noValidate className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Brand colour</h2>
        <p className="text-sm text-gray-600">Used for buttons on your guest menu. Leave blank for the TapFlow colours.</p>
        <div className="flex items-end gap-3">
          <label className="shrink-0">
            <span className="block text-sm font-medium text-ink">Pick</span>
            <input
              type="color"
              aria-label="Brand colour picker"
              className="mt-1 h-11 w-14 cursor-pointer rounded-xl border border-gray-300 bg-white p-1"
              value={normalized ?? DEFAULT_COLOR}
              onChange={(e) => change(e.target.value)}
            />
          </label>
          <TextField
            className="flex-1"
            label="Hex colour"
            placeholder="#1d4ed8"
            autoComplete="off"
            maxLength={7}
            value={hex}
            error={error ?? undefined}
            onChange={(e) => change(e.target.value)}
          />
        </div>
        {safe?.adjusted ? (
          <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Too light for readable buttons, darkened to {safe.color}.
          </p>
        ) : null}
        {safe ? (
          <p className="text-xs text-gray-600">
            Button text contrast: {contrastRatio(safe.color, textOn(safe.color)).toFixed(1)}:1 (AA needs 4.5:1).
          </p>
        ) : null}
        <Button type="submit">Save colour</Button>
        <p role="status" className="text-sm font-medium text-brand-800">{saved}</p>
      </form>
    </Card>
  );
}

export default function ProfilePage() {
  const { venue } = useDashboard();
  const { data, error, run } = useData(() => getServices().branding.get());
  const [previewColor, setPreviewColor] = useState<string | null | undefined>(undefined);

  if (!data) return <FormError message={error} />;
  const color = previewColor === undefined ? data.color : previewColor;
  const preview: Branding = { ...data, color };
  const upload = (kind: BrandImage) => (image: Blob) => void run(() => getServices().branding.upload(kind, image));
  const remove = (kind: BrandImage) => () => void run(() => getServices().branding.remove(kind));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-ink">Profile</h1>
      <p className="text-gray-600">Your logo, cover photo and colour appear on the menu guests see when they scan.</p>
      <FormError message={error} />

      <section aria-label="Guest menu preview" className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Preview</h2>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white" style={brandStyle(color)} data-testid="brand-preview">
          <GuestMenuHeader name={venue.name} touchpointLabel="Table 1" branding={preview} />
          <div className="p-4">
            <span className="brand-button block rounded-lg px-4 py-3 text-center font-medium">View cart · 1 item</span>
          </div>
        </div>
      </section>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Logo</h2>
        <p className="text-sm text-gray-600">Square works best. Resized to {LOGO_EDGE}px.</p>
        <ImageUpload
          name="logo"
          inputLabel="Logo"
          previewUrl={data.logoUrl}
          maxEdge={LOGO_EDGE}
          previewClassName="size-20 rounded-xl object-cover"
          onChoose={upload("logo")}
          onRemove={remove("logo")}
        />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Cover photo</h2>
        <p className="text-sm text-gray-600">Wide works best. Resized to {COVER_EDGE}px.</p>
        <ImageUpload
          name="cover"
          inputLabel="Cover photo"
          previewUrl={data.coverUrl}
          maxEdge={COVER_EDGE}
          previewClassName="h-24 w-full rounded-xl object-cover"
          onChoose={upload("cover")}
          onRemove={remove("cover")}
        />
      </Card>

      <ColorCard initial={data.color} onPreview={setPreviewColor} run={run} />
    </div>
  );
}
