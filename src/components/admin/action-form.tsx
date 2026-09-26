"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** A form bound to an admin Server Action that shows its success/error message. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: FormState | undefined, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={cn("space-y-3", className)}>
      <FormMessage state={state} />
      {children}
    </form>
  );
}

export const adminInput =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-accent";
export const adminButton =
  "inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50";
