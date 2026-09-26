"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "../actions";
import { buttonClasses } from "@/components/ui/button";

type Status = "loading" | "unsupported" | "denied" | "off" | "on" | "not-configured";

/**
 * Opt-in for Web Push on this device. Registers /sw.js, subscribes with the
 * server's VAPID public key and stores the subscription. Permission is only
 * requested when the user clicks "Turn on", never on page load.
 */
export function PushToggle({
  vapidPublicKey,
  configured,
  labels,
}: {
  vapidPublicKey: string;
  configured: boolean;
  labels: Record<
    "title" | "body" | "on" | "enable" | "disable" | "test" | "unsupported" | "denied" | "notConfigured",
    string
  >;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: Status;
      if (!configured || !vapidPublicKey) next = "not-configured";
      else if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
        next = "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const reg = await navigator.serviceWorker.getRegistration("/");
        next = (await reg?.pushManager.getSubscription()) ? "on" : "off";
      }
      if (!cancelled) setStatus(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, vapidPublicKey]);

  function enable() {
    startTransition(async () => {
      setMessage(null);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8(vapidPublicKey),
      });
      const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (!res.ok) {
        await sub.unsubscribe();
        setMessage(res.error ?? "Couldn't turn on push notifications.");
        return;
      }
      setStatus("on");
    });
  }

  function disable() {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    });
  }

  function test() {
    startTransition(async () => {
      const { sent } = await sendTestPush();
      setMessage(sent ? "Test notification sent." : "No active subscription found on this device.");
    });
  }

  const note =
    status === "unsupported"
      ? labels.unsupported
      : status === "denied"
        ? labels.denied
        : status === "not-configured"
          ? labels.notConfigured
          : null;

  return (
    <section className="glass flex flex-col gap-4 rounded-[var(--radius-card)] p-5 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-strong">
        <BellRing className="h-5 w-5 text-accent" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <h2 className="font-semibold">{labels.title}</h2>
        <p className="mt-0.5 text-muted">{note ?? (status === "on" ? labels.on : labels.body)}</p>
        {message && (
          <p className="mt-1 text-xs text-muted" role="status">
            {message}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {status === "loading" && <Loader2 className="h-5 w-5 animate-spin text-muted" />}
        {status === "off" && (
          <button type="button" onClick={enable} disabled={pending} className={buttonClasses({ size: "sm" })}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {labels.enable}
          </button>
        )}
        {status === "on" && (
          <>
            <button
              type="button"
              onClick={test}
              disabled={pending}
              className={buttonClasses({ size: "sm", variant: "secondary" })}
            >
              {labels.test}
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={pending}
              className={buttonClasses({ size: "sm", variant: "ghost" })}
            >
              {labels.disable}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function base64UrlToUint8(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
