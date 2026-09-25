import "server-only";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";

/** Lazy loaders so each request only loads the locale it needs. */
const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./dictionaries/en").then((m) => m.default),
};

/** Resolve the active locale from the user's cookie, falling back to the default. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/** Load the dictionary for the active locale (Server Components only). */
export async function getDictionary(locale?: Locale): Promise<Dictionary> {
  return loaders[locale ?? (await getLocale())]();
}
