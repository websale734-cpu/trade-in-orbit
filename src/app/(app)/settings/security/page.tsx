import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Globe, Laptop, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { beginTotpSetup } from "@/server/auth/totp";
import { listActiveSessions } from "@/server/auth/session";
import { db } from "@/server/db";
import { getDictionary } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { TwoFactorSetup } from "@/app/(onboarding)/onboarding/two-factor/two-factor-setup";
import { finishSecuritySetup, logoutEverywhere, logoutOtherDevices, revokeSession } from "./actions";
import { DisableTwoFactorForm } from "./disable-2fa-form";

export const metadata: Metadata = { title: "Security" };

const FAILED = new Set(["LOGIN_FAILED", "LOGIN_2FA_FAILED"]);

export default async function SecurityPage({ searchParams }: PageProps<"/settings/security">) {
  const session = await requireUser("/settings/security");
  const { user } = session;
  const sp = await searchParams;
  const dict = await getDictionary();
  const s = dict.app.security;

  const [sessions, events] = await Promise.all([
    listActiveSessions(user.id),
    db.securityEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  const settingUp = sp.setup === "2fa" && !user.totpEnabledAt;
  const setup = settingUp ? await beginTotpSetup(user.id, user.email, user.totpPendingSecretEnc) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{s.title}</h1>

      {/* Two-factor authentication */}
      <section className="glass rounded-[var(--radius-card)] p-6">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
              user.totpEnabledAt ? "bg-up/15" : "bg-warn/15",
            )}
          >
            {user.totpEnabledAt ? (
              <ShieldCheck className="h-5 w-5 text-up" />
            ) : (
              <ShieldOff className="h-5 w-5 text-warn" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{s.twoFactor}</h2>
            <p className="mt-1 text-sm text-muted">{user.totpEnabledAt ? s.twoFactorOn : s.twoFactorOff}</p>
          </div>
          {!user.totpEnabledAt && !settingUp && (
            <ButtonLink href="/settings/security?setup=2fa" size="sm">
              {s.enable}
            </ButtonLink>
          )}
        </div>
        {setup && (
          <div className="mt-6 border-t border-line pt-6">
            <TwoFactorSetup
              qrDataUrl={setup.qrDataUrl}
              manualKey={setup.manualKey}
              allowSkip={false}
              doneAction={finishSecuritySetup}
            />
          </div>
        )}
        {user.totpEnabledAt && (
          <div className="mt-6 border-t border-line pt-6">
            <p className="mb-3 text-sm text-muted">{s.disableConfirm}</p>
            <DisableTwoFactorForm label={s.disable} />
          </div>
        )}
      </section>

      {/* Active sessions */}
      <section className="glass rounded-[var(--radius-card)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{s.sessions}</h2>
          <div className="flex gap-2">
            {sessions.length > 1 && (
              <form action={logoutOtherDevices}>
                <button
                  type="submit"
                  className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface"
                >
                  {s.logoutOthers}
                </button>
              </form>
            )}
            <form action={logoutEverywhere}>
              <button
                type="submit"
                className="rounded-full border border-down/40 px-4 py-2 text-sm font-medium text-down hover:bg-down/10"
              >
                {s.logoutAll}
              </button>
            </form>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-line">
          {sessions.map((row) => {
            const current = row.id === session.id;
            const Icon = row.device?.includes("mobile") ? Smartphone : Laptop;
            return (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <Icon className="h-5 w-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {row.device ?? s.unknownDevice}
                    {current && (
                      <span className="ml-2 rounded-full bg-up/15 px-2 py-0.5 text-xs text-up">{s.thisDevice}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[row.ip, row.location].filter(Boolean).join(" · ")} · {s.lastActive}{" "}
                    <LocalTime date={row.lastSeenAt.toISOString()} />
                  </p>
                </div>
                {!current && (
                  <form action={revokeSession}>
                    <input type="hidden" name="sessionId" value={row.id} />
                    <button type="submit" className="text-sm font-medium text-muted hover:text-down">
                      {s.revoke}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Security log */}
      <section className="glass rounded-[var(--radius-card)] p-6">
        <h2 className="font-semibold">{s.log}</h2>
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{s.logEmpty}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {events.map((e) => {
              const failed = FAILED.has(e.type);
              return (
                <li key={e.id} className="flex items-start gap-3 py-3 text-sm">
                  {failed ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-down" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", failed && "text-down")}>{s.events[e.type]}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <LocalTime date={e.createdAt.toISOString()} />
                      {e.device && <span>· {e.device}</span>}
                      {e.ip && <span>· {e.ip}</span>}
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          · <Globe className="h-3 w-3" /> {e.location}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
