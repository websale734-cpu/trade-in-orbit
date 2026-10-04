import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/** Shown instead of deposit/withdraw forms until identity verification is approved. */
export function KycGate({ action, status }: { action: string; status: string }) {
  const pending = status === "PENDING";
  return (
    <div className="glass mx-auto max-w-lg rounded-[var(--radius-card)] p-8 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-warn" />
      <h2 className="mt-4 text-xl font-semibold">Identity verification required</h2>
      <p className="mt-2 text-sm text-muted">
        {pending
          ? `Your documents are in review. You'll be able to ${action} as soon as they're approved.`
          : `By law we must verify your identity before you can ${action}.`}
      </p>
      <ButtonLink href="/onboarding/kyc" className="mt-6">
        {pending ? "View status" : "Verify identity"}
      </ButtonLink>
    </div>
  );
}

export function SandboxBadge() {
  return (
    <span
      className="rounded bg-warn/20 px-1.5 py-0.5 text-xs font-bold tracking-wider text-warn uppercase"
      title="Test mode: no real money moves"
    >
      Sandbox
    </span>
  );
}
