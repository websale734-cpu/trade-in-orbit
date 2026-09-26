"use client";

import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { buttonClasses } from "./button";
import { cn } from "@/lib/utils";

/** Result shape returned by every form Server Action. */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string | undefined>;
  message?: string;
  /** Echo of submitted values (never passwords) so fields survive a failed submit. */
  values?: Record<string, string>;
};

export const inputClasses =
  "h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-fg placeholder:text-subtle transition-colors outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-down sm:text-sm";

/** Labelled input with hint and inline error. */
export function Field({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string; hint?: string }) {
  const id = props.id ?? name;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={inputClasses}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Submit button that shows a spinner while its form's action is pending. */
export function SubmitButton({
  children,
  className,
  variant,
  pendingLabel,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={buttonClasses({ variant, size: "lg", className: cn("w-full", className) })}
      {...props}
    >
      {pending && <Loader2 className="h-5 w-5 animate-spin" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Form-level error or success banner. */
export function FormMessage({ state }: { state: FormState | undefined }) {
  if (state?.error)
    return (
      <div role="alert" className="flex gap-2.5 rounded-xl border border-down/30 bg-down/10 p-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-down" />
        <span>{state.error}</span>
      </div>
    );
  if (state?.message)
    return (
      <div role="status" className="flex gap-2.5 rounded-xl border border-up/30 bg-up/10 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" />
        <span>{state.message}</span>
      </div>
    );
  return null;
}
