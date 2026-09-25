"use client";

import { useLayoutEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type Theme } from "./theme-script";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

function readSavedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

/**
 * Light/dark switch. The saved choice is applied pre-paint by <ThemeScript />.
 * The icon swap is pure CSS (driven by `data-theme`), so there is no React state
 * to get out of sync with the DOM and no hydration mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { dict } = useI18n();

  // Re-apply the saved theme after React's dev-mode remount resets <html>
  // attributes. A no-op in production.
  useLayoutEffect(() => {
    const saved = readSavedTheme();
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function toggle() {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next: Theme = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage blocked: theme still applies for this page view */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dict.common.theme.toggle}
      title={dict.common.theme.toggle}
      className={cn(
        "relative grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-fg",
        className,
      )}
    >
      <Sun className="absolute h-[18px] w-[18px] scale-100 rotate-0 opacity-100 transition-all duration-300 dark:scale-0 dark:rotate-90 dark:opacity-0" />
      <Moon className="absolute h-[18px] w-[18px] scale-0 -rotate-90 opacity-0 transition-all duration-300 dark:scale-100 dark:rotate-0 dark:opacity-100" />
    </button>
  );
}
