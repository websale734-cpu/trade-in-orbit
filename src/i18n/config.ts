/**
 * Locale configuration.
 *
 * To add a language:
 *   1. Create `src/i18n/dictionaries/<code>.ts` exporting a `Dictionary` (TypeScript
 *      will flag any missing keys).
 *   2. Add the code to `locales` and its loader to `loaders` in `./server.ts`.
 *   3. Add a label to `localeLabels`.
 *
 * The active locale is stored in the `orb_locale` cookie (set by the language switcher),
 * so URLs stay clean (no /en/ prefix) for both public and signed-in pages.
 */
export const locales = ["en", "es", "fr", "de", "zh", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "orb_locale";

/** Native names shown in the language switcher. */
export const localeLabels: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  zh: "中文",
  ar: "العربية",
};

/** Locales written right-to-left. Used to set <html dir>. */
export const rtlLocales: readonly Locale[] = ["ar"];

export function localeDir(locale: Locale): "rtl" | "ltr" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
