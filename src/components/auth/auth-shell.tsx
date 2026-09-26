import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/** Minimal, focused chrome for sign-up, login and onboarding: logo, theme toggle, centred card. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-3xl" />
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_65%)]" />

      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Orbtrade home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0">
        <div className="glass w-full max-w-md animate-fade-up rounded-[1.75rem] p-6 sm:p-8">{children}</div>
      </main>

      <footer className="relative pb-6 text-center text-xs text-subtle">
        <Link href="/legal/terms" className="hover:text-fg">
          Terms
        </Link>
        <span className="mx-2">·</span>
        <Link href="/legal/privacy" className="hover:text-fg">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/legal/risk" className="hover:text-fg">
          Risk Disclosure
        </Link>
      </footer>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
