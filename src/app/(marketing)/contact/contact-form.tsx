"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { sendContactMessage } from "./actions";

/** Support form. Remounts on "Send another message" so the fields start empty. */
export function ContactForm() {
  const [round, setRound] = useState(0);
  return <ContactFormInner key={round} onReset={() => setRound((n) => n + 1)} />;
}

function ContactFormInner({ onReset }: { onReset: () => void }) {
  const [state, action] = useActionState(sendContactMessage, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;

  if (state?.message) {
    return (
      <div role="status" className="flex flex-col items-center py-6 text-center sm:py-10">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-up/10 ring-1 ring-up/30">
          <CheckCircle2 className="h-7 w-7 text-up" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight">Message sent</h2>
        <p className="mt-3 max-w-sm text-muted">
          Thanks{v?.name ? `, ${v.name}` : ""}. Your message is with our support team, and we&apos;ll reply to{" "}
          <span className="font-medium break-words text-fg">{v?.email}</span> as soon as we can.
        </p>
        <Button type="button" variant="secondary" className="mt-8" onClick={onReset}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="name" autoComplete="name" maxLength={100} defaultValue={v?.name} error={e?.name} />
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          defaultValue={v?.email}
          error={e?.email}
        />
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={7}
          maxLength={5000}
          defaultValue={v?.message}
          aria-invalid={!!e?.message}
          aria-describedby={e?.message ? "message-error" : undefined}
          placeholder="How can we help? Please don't include passwords or 2FA codes."
          className={`${inputClasses} h-auto resize-y py-3`}
        />
        {e?.message && (
          <p id="message-error" className="mt-1.5 text-sm text-down">
            {e.message}
          </p>
        )}
      </div>
      {/* Honeypot for bots: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company URL
          <input name="company_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <SubmitButton pendingLabel="Sending...">Send message</SubmitButton>
    </form>
  );
}
