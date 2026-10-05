"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Download, Share, SquarePlus, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { canPromptInstall, promptInstall, startInstallCapture, subscribeInstall } from "./install-events";

startInstallCapture();

const SNOOZE_KEY = "orb_install_prompt_snooze_until";
const SNOOZE_EVENT = "orb-install-prompt-snooze";
const SNOOZE_DAYS = 14;

type Mode = "hidden" | "ios" | "native";

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac, so check for touch). Never true on Android. */
function isIos() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return false;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** Already running as the installed app. */
function isStandalone() {
  return (
    ["standalone", "fullscreen", "minimal-ui"].some((m) => window.matchMedia(`(display-mode: ${m})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isSnoozed() {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/**
 * Which flow this device gets. Android and desktop Chrome/Edge only see the
 * prompt once the browser has offered a native install (so one tap installs);
 * iPhone/iPad get the Share → Add to Home Screen steps instead.
 */
function currentMode(): Mode {
  if (isStandalone() || isSnoozed()) return "hidden";
  if (isIos()) return "ios";
  return canPromptInstall() ? "native" : "hidden";
}

function subscribe(cb: () => void) {
  const off = subscribeInstall(cb);
  window.addEventListener(SNOOZE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    off();
    window.removeEventListener(SNOOZE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    /* storage blocked: hidden for this visit only */
  }
  window.dispatchEvent(new Event(SNOOZE_EVENT));
}

type Labels = Record<
  | "title"
  | "body"
  | "button"
  | "dismiss"
  | "iosTitle"
  | "iosIntro"
  | "iosStep1"
  | "iosStep1Hint"
  | "iosStep2"
  | "iosStep2Hint"
  | "iosStep3"
  | "iosStep3Hint"
  | "gotIt",
  string
>;

/** Dashboard card inviting signed-in customers to install the app; hidden once installed or dismissed. */
export function InstallPrompt({ labels }: { labels: Labels }) {
  const mode = useSyncExternalStore(subscribe, currentMode, () => "hidden" as Mode);
  const [steps, setSteps] = useState(false);
  // A dismissal during this visit hides the card even if storage is blocked.
  const [closed, setClosed] = useState(false);

  if (mode === "hidden" || closed) return null;

  function dismiss() {
    setClosed(true);
    snooze();
  }

  async function install() {
    if (mode === "ios") return setSteps(true);
    const outcome = await promptInstall();
    if (outcome === "dismissed") dismiss();
  }

  return (
    <>
      <section
        aria-label={labels.title}
        className="glass flex flex-col gap-4 rounded-[var(--radius-card)] p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-2xl shadow-[0_8px_24px_-8px_var(--glow-violet)]"
          />
          <div className="min-w-0">
            <h2 className="font-semibold">{labels.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{labels.body}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={install} className={buttonClasses({ className: "flex-1 sm:flex-none" })}>
            <Download className="h-4 w-4" />
            {labels.button}
          </button>
          <button type="button" onClick={dismiss} className={buttonClasses({ variant: "ghost" })}>
            {labels.dismiss}
          </button>
        </div>
      </section>
      {steps && <IosSteps labels={labels} onClose={() => setSteps(false)} onDone={dismiss} />}
    </>
  );
}

/** Apple doesn't allow one-tap install, so show how to add the app from the Share menu. */
function IosSteps({ labels, onClose, onDone }: { labels: Labels; onClose: () => void; onDone: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const items = [
    { icon: Share, title: labels.iosStep1, hint: labels.iosStep1Hint },
    { icon: SquarePlus, title: labels.iosStep2, hint: labels.iosStep2Hint },
    { icon: CircleCheck, title: labels.iosStep3, hint: labels.iosStep3Hint },
  ];

  // Portal to <body> so the sheet covers the whole screen, including the phone tab bar.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={labels.dismiss}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-steps-title"
        className="relative w-full max-w-md rounded-t-3xl border border-line-strong bg-bg-elevated p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[var(--radius-card)] sm:pb-6"
      >
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
          <img src="/icons/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <h2 id="install-steps-title" className="text-lg font-semibold">
              {labels.iosTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">{labels.iosIntro}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.dismiss}
            className="-mt-1 -mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mt-6 space-y-3">
          {items.map(({ icon: Icon, title, hint }, i) => (
            <li key={i} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-strong text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  <span className="text-muted">{i + 1}.</span> {title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>
              </span>
            </li>
          ))}
        </ol>

        <button type="button" onClick={onDone} className={buttonClasses({ className: "mt-6 w-full" })}>
          {labels.gotIt}
        </button>
      </div>
    </div>,
    document.body,
  );
}
