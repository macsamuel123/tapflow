"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, TextField } from "@/components/ui";
import { emailError } from "@/lib/validation";
import { getServices } from "@/services";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [sent, setSent] = useState(false);
  const error = emailError(email);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (error) return;
    await getServices().auth.requestPasswordReset(email);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-3" role="status">
        <h1 className="text-2xl font-black text-ink">Check your email</h1>
        <p className="text-gray-600">In the live product, a reset link goes to {email}. The demo sends no email.</p>
        <Link href="/login" className="font-semibold text-brand-700">Back to log in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
      <h1 className="text-2xl font-black text-ink">Reset your password</h1>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        error={attempted ? error : undefined}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" className="w-full">Send reset link</Button>
      <p className="text-center text-sm"><Link href="/login" className="font-semibold text-brand-700">Back to log in</Link></p>
    </form>
  );
}
