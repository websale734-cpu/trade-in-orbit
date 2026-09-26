import {
  ArrowLeftRight,
  BellRing,
  BookOpenCheck,
  CalendarClock,
  ClipboardList,
  FlaskConical,
  Fingerprint,
  Layers,
  Lock,
  ScanFace,
  ShieldCheck,
  ScrollText,
} from "lucide-react";
import { Hero } from "@/components/landing/hero";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeeTable } from "@/components/landing/fee-table";
import { Testimonials } from "@/components/landing/testimonials";
import { Faq } from "@/components/landing/faq";
import { MarketProvider } from "@/components/market/market-provider";
import { PriceTicker } from "@/components/market/price-ticker";
import { MarketsSection } from "@/components/market/markets-section";
import { ButtonLink } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { getMarketSnapshot } from "@/lib/market/coingecko";
import { getApprovedTestimonials, getFaq } from "@/server/content";
import { getDictionary } from "@/i18n/server";

export default async function LandingPage() {
  const [dict, snapshot, testimonials, faq] = await Promise.all([
    getDictionary(),
    getMarketSnapshot(),
    getApprovedTestimonials(),
    getFaq(),
  ]);

  return (
    <MarketProvider initial={snapshot}>
      <Hero dict={dict} />
      <PriceTicker />

      <Section id="markets" title={dict.markets.title} subtitle={dict.markets.subtitle}>
        <MarketsSection />
      </Section>

      <Section id="features" title={dict.features.title} subtitle={dict.features.subtitle}>
        <FeatureGrid
          items={dict.features.items}
          icons={[ArrowLeftRight, BookOpenCheck, Layers, CalendarClock, BellRing, FlaskConical]}
        />
      </Section>

      <Section id="how-it-works" title={dict.how.title}>
        <HowItWorks steps={dict.how.steps} />
      </Section>

      <Section id="security" title={dict.security.title} subtitle={dict.security.subtitle}>
        <FeatureGrid
          items={dict.security.items}
          icons={[Fingerprint, ShieldCheck, Lock, ScanFace, ClipboardList, ScrollText]}
        />
      </Section>

      <Section id="fees" title={dict.fees.title} subtitle={dict.fees.subtitle}>
        <FeeTable dict={dict} />
      </Section>

      <Section id="testimonials" title={dict.testimonials.title} subtitle={dict.testimonials.subtitle}>
        <Testimonials items={testimonials} dict={dict} />
      </Section>

      <Section id="faq" title={dict.faq.title}>
        <Faq items={faq ?? dict.faq.items} />
      </Section>

      {/* Closing call to action */}
      <section className="pb-20 sm:pb-28">
        <Container>
          <Reveal className="glass ring-brand relative overflow-hidden rounded-[2rem] px-6 py-14 text-center sm:px-12">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-2xl" />
            <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {dict.cta.title}
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-muted">{dict.cta.subtitle}</p>
            <ButtonLink href="/register" size="lg" className="relative mt-8">
              {dict.common.createAccount}
            </ButtonLink>
          </Reveal>
        </Container>
      </section>
    </MarketProvider>
  );
}
