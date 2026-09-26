import { Construction } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";

/**
 * Honest "coming soon" screen for Deposit, Withdraw and Trade, which are built
 * in Phase 4. The dashboard's quick actions link here until then.
 */
export async function ComingSoonFeature({ name, path }: { name: string; path: string }) {
  const { user } = await requireUser(path);
  const dict = await getDictionary();
  const t = dict.app.phase4;
  return (
    <div className="grid place-items-center py-12">
      <div className="glass max-w-md rounded-[var(--radius-card)] p-8 text-center">
        <Construction className="mx-auto h-10 w-10 text-accent" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{fmt(t.title, { feature: name })}</h1>
        <p className="mt-3 text-sm text-muted">{t.body}</p>
        <div className="mt-8 flex flex-col gap-3">
          {user.kycStatus !== "APPROVED" && <ButtonLink href="/onboarding/kyc">{t.verify}</ButtonLink>}
          <ButtonLink href="/dashboard" variant="secondary">
            {t.back}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
