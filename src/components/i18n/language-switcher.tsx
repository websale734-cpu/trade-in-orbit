"use client";

import { Globe } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { locales, localeLabels, LOCALE_COOKIE } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Language picker. Writes the chosen locale to the `orb_locale` cookie and
 * reloads so the server re-renders every page (and <html lang/dir>) in that
 * language. Works for signed-out and signed-in pages alike.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, dict } = useI18n();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    try {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* cookies blocked: fall through, the reload simply keeps the current locale */
    }
    window.location.reload();
  }

  return (
    <div className={cn("relative", className)}>
      <Globe
        className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <select
        value={locale}
        onChange={onChange}
        aria-label={dict.common.language}
        className="h-10 appearance-none rounded-full border border-line bg-surface py-0 pr-3 pl-8 text-sm text-muted transition-colors hover:text-fg focus:border-accent focus:outline-none"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeLabels[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
