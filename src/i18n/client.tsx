"use client";

import { createContext, useContext } from "react";
import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";

type I18nValue = { locale: Locale; dict: Dictionary };

const I18nContext = createContext<I18nValue | null>(null);

/** Provides the active dictionary to Client Components (set once in the root layout). */
export function I18nProvider({ locale, dict, children }: I18nValue & { children: React.ReactNode }) {
  return <I18nContext.Provider value={{ locale, dict }}>{children}</I18nContext.Provider>;
}

/** Access translations inside Client Components: `const { dict } = useI18n()`. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
