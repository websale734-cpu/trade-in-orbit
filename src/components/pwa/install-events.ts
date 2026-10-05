/**
 * Holds the browser's "beforeinstallprompt" event (Chrome/Edge on Android and
 * desktop) so the dashboard can trigger the native install dialog with one tap.
 * Capture starts on the first page load, since the event fires only once per
 * page and may arrive before the dashboard is open. iPhone Safari never fires it.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startInstallCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep the browser's own banner away; the dashboard shows a polite prompt instead.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function subscribeInstall(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function canPromptInstall() {
  return deferred !== null;
}

/** Opens the native install dialog. The event is single-use, so it's cleared either way. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome;
}
