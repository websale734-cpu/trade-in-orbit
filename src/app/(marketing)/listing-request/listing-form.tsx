"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { submitListingRequest } from "./actions";

export function ListingForm() {
  const [state, action] = useActionState(submitListingRequest, undefined);
  if (state?.message) return <FormMessage state={state} />;
  const v = state?.values;
  const e = state?.fieldErrors;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" name="projectName" defaultValue={v?.projectName} error={e?.projectName} />
        <Field label="Ticker symbol" name="symbol" defaultValue={v?.symbol} error={e?.symbol} />
      </div>
      <Field label="Website" name="website" type="url" placeholder="https://" defaultValue={v?.website} error={e?.website} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Network (optional)" name="network" placeholder="e.g. Ethereum" defaultValue={v?.network} error={e?.network} />
        <Field label="Contract address (optional)" name="contract" defaultValue={v?.contract} error={e?.contract} />
      </div>
      <Field label="Contact email" name="email" type="email" autoComplete="email" defaultValue={v?.email} error={e?.email} />
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
          About the project
        </label>
        <textarea
          id="message"
          name="message"
          rows={6}
          maxLength={3000}
          defaultValue={v?.message}
          aria-invalid={!!e?.message}
          placeholder="What it does, team, audits, liquidity, community..."
          className={`${inputClasses} h-auto py-3`}
        />
        {e?.message && <p className="mt-1.5 text-sm text-down">{e.message}</p>}
      </div>
      {/* Honeypot for bots: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company URL
          <input name="company_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <SubmitButton>Submit request</SubmitButton>
    </form>
  );
}
