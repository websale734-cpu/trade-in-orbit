"use client";

import { useEffect } from "react";
import { startInstallCapture } from "./install-events";

// Listen as soon as this module loads, before React effects run.
startInstallCapture();

/** Registers the service worker (push only, no page caching) so the site can be installed as an app. */
export function PwaSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
