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
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "orb_locale";

export const localeLabels: Record<Locale, string> = {
  en: "English",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
