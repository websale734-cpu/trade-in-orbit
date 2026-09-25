"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Sticky public header. Turns glassy once the page scrolls; full-screen sheet menu on mobile. */
export function SiteHeader() {
  const { dict } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock background scroll while the mobile menu is open; close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    { href: "/#markets", label: dict.nav.markets },
    { href: "/#features", label: dict.nav.features },
    { href: "/#security", label: dict.nav.security },
    { href: "/#fees", label: dict.nav.fees },
    { href: "/#faq", label: dict.nav.faq },
  ];

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 transition-all duration-300",
          scrolled || open ? "border-b border-line bg-bg/75 backdrop-blur-xl" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Orbtrade home" onClick={() => setOpen(false)}>
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <ButtonLink href="/login" variant="ghost" size="sm" className="max-sm:hidden">
              {dict.common.logIn}
            </ButtonLink>
            <ButtonLink href="/register" size="sm" className="max-sm:hidden">
              {dict.common.createAccount}
            </ButtonLink>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface md:hidden"
              aria-label={open ? dict.common.close : dict.common.menu}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sheet. Rendered outside <header> because the header's backdrop-filter
          would otherwise become the containing block for this fixed element. */}
      <div
        id="mobile-menu"
        className={cn(
          "fixed inset-x-0 top-16 bottom-0 z-40 bg-bg/95 backdrop-blur-xl transition-all duration-300 md:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <nav className="flex flex-col gap-1 px-4 pt-4" aria-label="Mobile">
          {links.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-2xl px-4 py-4 text-lg font-medium transition-all duration-300 hover:bg-surface",
                open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
              )}
              style={{ transitionDelay: open ? `${i * 40}ms` : "0ms" }}
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-4 grid gap-3 border-t border-line pt-6">
            <ButtonLink href="/register" size="lg" onClick={() => setOpen(false)}>
              {dict.common.createAccount}
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg" onClick={() => setOpen(false)}>
              {dict.common.logIn}
            </ButtonLink>
          </div>
        </nav>
      </div>
    </>
  );
}
