"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { getServices, ServiceError } from "@/services";

export default function OpenVenuePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setError("Enter your venue recovery code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getServices().auth.openVenue(code);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ServiceError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (!DEMO_CLOUD) return <p className="text-gray-600">This isn&apos;t available in this demo.</p>;
  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
      <h1 className="text-2xl font-black text-ink">Open my venue</h1>
      <p className="text-gray-600">Enter the recovery code you saved when you created your venue.</p>
      <TextField
        label="Venue recovery code"
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="TF-XXXX-XXXX-XXXX-XXXX"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <FormError message={error} />
      <Button type="submit" className="w-full" disabled={busy}>Open venue</Button>
      <p className="text-center text-sm"><Link href="/login" className="font-semibold text-brand-700">Back to log in</Link></p>
    </form>
  );
}
