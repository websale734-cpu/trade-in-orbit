"use client";

import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";

/**
 * "Resend code" link with a live cooldown. The server enforces the real
 * cooldown; this just mirrors it so the button isn't clickable too early.
 */
export function ResendButton({
  action,
  initialCooldown,
}: {
  action: (prev: FormState | undefined, fd: FormData) => Promise<FormState & { cooldown?: number }>;
  initialCooldown: number;
}) {
  const { dict } = useI18n();
  const [state, formAction, pending] = useActionState(action, undefined);
  const [remaining, setRemaining] = useState(initialCooldown);

  // Restart the countdown whenever the server reports a new cooldown.
  const serverCooldown = state?.cooldown;
  const [seenCooldown, setSeenCooldown] = useState(serverCooldown);
  if (serverCooldown !== seenCooldown) {
    setSeenCooldown(serverCooldown);
    if (serverCooldown !== undefined) setRemaining(serverCooldown);
  }

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return (
    <form action={formAction} className="text-center text-sm">
      <button
        type="submit"
        disabled={remaining > 0 || pending}
        className="font-medium text-accent transition-opacity hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
      >
        {remaining > 0 ? fmt(dict.auth.code.resendIn, { s: remaining }) : dict.auth.code.resend}
      </button>
      {state?.error && <p className="mt-2 text-down">{state.error}</p>}
      {state?.message && <p className="mt-2 text-up">{state.message}</p>}
    </form>
  );
}
