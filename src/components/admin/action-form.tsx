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
  const [state, formAction, isPending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      // Ignore repeat submits while one is running: actions can take seconds, and a
      // second click would queue a duplicate (e.g. a second balance adjustment).
      onSubmit={(e) => {
        if (isPending) e.preventDefault();
      }}
      aria-busy={isPending}
      className={cn("space-y-3", className, isPending && "cursor-wait opacity-60")}
    >
      {isPending ? (
        <p role="status" className="text-sm text-muted">
          Working…
        </p>
      ) : (
        <FormMessage state={state} />
      )}
      {children}
    </form>
  );
}

// adminInput / adminButton now live in ./styles (a server-safe module) and must
// be imported directly from there. They used to be exported here, but a "use
// client" module turns every export (even a re-export) into a client reference,
// so Server Components received a proxy that cn() stringified into a broken
// className. Importing from ./styles gives Server Components the real string.
