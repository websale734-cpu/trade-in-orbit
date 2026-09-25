import { ArrowRight, Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { HeroChartCard } from "@/components/market/hero-chart-card";
import type { Dictionary } from "@/i18n/dictionaries/en";

export function Hero({ dict }: { dict: Dictionary }) {
  const h = dict.hero;
  return (
    <section className="relative overflow-hidden">
      {/* Background: dotted grid + two soft brand glows */}
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-3xl" />
      <div className="pointer-events-none absolute top-40 -right-40 h-[380px] w-[380px] rounded-full bg-[radial-gradient(closest-side,var(--glow-cyan),transparent)] blur-3xl" />

      <Container className="relative grid items-center gap-12 pt-12 pb-16 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-24 lg:pb-24">
        <div className="animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="bg-brand h-1.5 w-1.5 rounded-full" />
            {h.eyebrow}
          </p>
          <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {h.titleA} <span className="text-brand">{h.titleB}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-pretty text-muted">{h.subtitle}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/register" size="lg" className="group">
              {dict.common.createAccount}
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </ButtonLink>
            <ButtonLink href="/#markets" size="lg" variant="secondary">
              {h.secondaryCta}
            </ButtonLink>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {h.points.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-accent-cyan" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-fade-up [animation-delay:150ms]">
          <HeroChartCard />
        </div>
      </Container>
    </section>
  );
}
