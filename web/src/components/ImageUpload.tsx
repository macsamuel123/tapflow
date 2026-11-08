"use client";

import { useState } from "react";
import { Button, buttonClass, FormError } from "@/components/ui";
import { MAX_STORED_BYTES, photoFileError, preparePhoto } from "@/lib/menu/photo";

/** Pick, check, resize: the same rules for menu photos, logos and covers. */
export function ImageUpload({
  name,
  inputLabel,
  previewUrl,
  maxEdge,
  previewClassName = "h-32 w-32 rounded-xl object-cover",
  onChoose,
  onRemove,
}: {
  /** "photo", "logo", "cover": used in the button and preview text. */
  name: string;
  /** The file input's accessible name, unique on the page: "Item 2 photo". */
  inputLabel: string;
  previewUrl: string | null;
  maxEdge?: number;
  previewClassName?: string;
  onChoose: (image: Blob) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    const problem = photoFileError(file);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const image = await preparePhoto(file, maxEdge);
      if (image.size > MAX_STORED_BYTES) {
        setError("That image is still over 500 KB after resizing. Try a simpler one.");
        return;
      }
      await onChoose(image);
    } catch {
      setError("That file couldn't be read as an image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, which next/image can't optimise
        <img src={previewUrl} alt={`${inputLabel} preview`} className={previewClassName} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <label className={buttonClass("secondary", `cursor-pointer has-focus-visible:outline-2 ${busy ? "opacity-50" : ""}`)}>
          {previewUrl ? `Replace ${name}` : `Upload ${name}`}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={inputLabel}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {previewUrl ? (
          <Button variant="danger" onClick={() => void onRemove()}>
            Remove {name}
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-gray-600">JPG, PNG or WebP, up to 5 MB.</p>
      <FormError message={error} />
    </div>
  );
}
