"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { openTicket, replyToTicket } from "./actions";

export function TicketForm({ categories }: { categories: readonly string[] }) {
  const [state, action] = useActionState(openTicket, undefined);
  const v = state?.values;
  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Subject" name="subject" maxLength={120} defaultValue={v?.subject} error={state?.fieldErrors?.subject} />
      <div>
        <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
          Category
        </label>
        <select id="category" name="category" defaultValue={v?.category || categories[0]} className={inputClasses}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <MessageBox name="body" label="How can we help?" defaultValue={v?.body} error={state?.fieldErrors?.body} />
      <p className="text-xs text-subtle">Never share your password, 2FA codes or recovery codes. Trade In Orbit staff will never ask for them.</p>
      <SubmitButton variant="secondary">Send to support</SubmitButton>
    </form>
  );
}

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(replyToTicket, undefined);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessage state={state?.error ? state : undefined} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <MessageBox name="body" label="Reply" defaultValue={state?.error ? state.values?.body : ""} />
      <SubmitButton variant="secondary">Send reply</SubmitButton>
    </form>
  );
}

function MessageBox({ name, label, defaultValue, error }: { name: string; label: string; defaultValue?: string; error?: string }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={5}
        maxLength={4000}
        defaultValue={defaultValue}
        aria-invalid={!!error}
        className={`${inputClasses} h-auto py-3`}
      />
      {error && <p className="mt-1.5 text-sm text-down">{error}</p>}
    </div>
  );
}
