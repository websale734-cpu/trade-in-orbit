import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, BadgeCheck, Bell, Landmark, ShieldAlert } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { latestNotifications, pushConfigured } from "@/server/notify/notifications";
import { getDictionary } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead } from "../actions";
import { PushToggle } from "./push-toggle";

export const metadata: Metadata = { title: "Notifications" };

const ICONS = { SECURITY: ShieldAlert, ACCOUNT: Landmark, KYC: BadgeCheck, TRANSFER: ArrowLeftRight, SYSTEM: Bell };

export default async function NotificationsPage() {
  const { user } = await requireUser("/notifications");
  const [dict, items] = await Promise.all([getDictionary(), latestNotifications(user.id, 50)]);
  const t = dict.app.notifications;
  const unread = items.filter((i) => !i.readAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface"
            >
              {t.markAll}
            </button>
          </form>
        )}
      </div>

      <PushToggle
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        configured={pushConfigured()}
        labels={{
          title: t.push,
          body: t.pushBody,
          on: t.pushOn,
          enable: t.pushEnable,
          disable: t.pushDisable,
          test: t.pushTest,
          unsupported: t.pushUnsupported,
          denied: t.pushDenied,
          notConfigured: t.pushNotConfigured,
        }}
      />

      <section className="glass rounded-[var(--radius-card)] p-2 sm:p-3">
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{t.empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const Icon = ICONS[n.type];
              const body = (
                <div
                  className={cn(
                    "flex gap-3 rounded-xl p-3 transition-colors hover:bg-surface",
                    !n.readAt && "bg-surface",
                  )}
                >
                  <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-strong">
                    <Icon className={cn("h-[18px] w-[18px]", n.type === "SECURITY" ? "text-warn" : "text-accent")} />
                    {!n.readAt && (
                      <span
                        className="bg-brand absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                        aria-label="Unread"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className={cn(!n.readAt && "font-semibold")}>{n.title}</p>
                    <p className="mt-0.5 text-muted">{n.body}</p>
                    <p className="mt-1 text-xs text-subtle">
                      <LocalTime date={n.createdAt.toISOString()} />
                    </p>
                  </div>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link}>{body}</Link> : body}</li>;
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
