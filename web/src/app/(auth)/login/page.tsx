"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, TextField } from "@/components/ui";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { emailError } from "@/lib/validation";
import { getServices } from "@/services";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const errors = {
    email: emailError(email),
    password: password ? undefined : "Enter your password.",
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (errors.email || errors.password) return;
    await getServices().auth.logIn(email, password);
    router.push("/dashboard");
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
      <h1 className="text-2xl font-black text-ink">Log in</h1>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        error={attempted ? errors.email : undefined}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        error={attempted ? errors.password : undefined}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" className="w-full">Log in</Button>
      <p className="text-center text-sm text-gray-600">
        <Link href="/forgot-password" className="font-semibold text-brand-700">Forgot password?</Link>
        {" · "}
        <Link href="/signup" className="font-semibold text-brand-700">Create an account</Link>
      </p>
      {DEMO_CLOUD ? (
        <p className="text-center text-sm">
          <Link href="/open-venue" className="font-semibold text-brand-700">Open my venue</Link>
        </p>
      ) : null}
    </form>
  );
}
