import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignupWizard } from "@/components/signup/SignupWizard";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <>
      <Suspense>
        <SignupWizard />
      </Suspense>
      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account? <Link href="/login" className="font-semibold text-brand-700">Log in</Link>
      </p>
    </>
  );
}
