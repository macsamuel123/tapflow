import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { useId } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "brand";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  secondary: "border border-gray-300 bg-white text-ink hover:bg-gray-50",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  /** Guest pages: the venue's colour, from the --brand variables. */
  brand: "brand-button",
};

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold " +
  "transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return `${BUTTON} ${VARIANTS[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const CONTROL =
  "mt-1 block min-h-11 w-full rounded-xl border bg-white px-3 py-2 text-base text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700 ";

type FieldShell = { label: string; error?: string; hint?: string };

function Message({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  return (
    <>
      {hint && !error ? <p id={`${id}-note`} className="mt-1 text-sm text-gray-600">{hint}</p> : null}
      {error ? <p id={`${id}-note`} role="alert" className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}
    </>
  );
}

export function TextField({
  label,
  error,
  hint,
  className = "",
  ...props
}: FieldShell & ComponentProps<"input">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={CONTROL + (error ? "border-red-500" : "border-gray-300")}
        {...props}
      />
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className = "",
  children,
  ...props
}: FieldShell & ComponentProps<"select">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={CONTROL + (error ? "border-red-500" : "border-gray-300")}
        {...props}
      >
        {children}
      </select>
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}

export function YesNo({
  legend,
  name,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  /** Null shows neither answer chosen. */
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[true, false].map((option) => (
          <label
            key={String(option)}
            className={
              "flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold " +
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-700 " +
              (value === option
                ? "border-brand-700 bg-brand-50 text-brand-800"
                : "border-gray-300 bg-white text-ink")
            }
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === option}
              onChange={() => onChange(option)}
            />
            {option ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white p-4 ${className}`}>{children}</div>;
}

export type Tone = "green" | "amber" | "blue" | "gray" | "red";

const TONES: Record<Tone, string> = {
  green: "bg-brand-100 text-brand-800",
  amber: "bg-amber-100 text-amber-900",
  blue: "bg-sky-100 text-sky-900",
  gray: "bg-gray-100 text-gray-700",
  red: "bg-red-100 text-red-800",
};

export function Pill({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
      {message}
    </p>
  );
}

export function NotLive() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold text-ink">This page isn&apos;t live yet</h1>
      <p className="text-gray-600">Sign-up and the venue dashboard are coming soon.</p>
      <LinkButton href="/" variant="secondary">Back to home</LinkButton>
    </main>
  );
}
