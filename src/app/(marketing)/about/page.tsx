import type { Metadata } from "next";
import { Eye, Lock, Scale } from "lucide-react";
import { Container } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "About", description: "Who we are and how Orbtrade works." };

export default function AboutPage() {
  const values = [
    { icon: Lock, title: "Security first", body: "Two-factor authentication, encrypted personal data, withdrawal reviews and a double-entry ledger where every balance change is recorded and auditable." },
    { icon: Eye, title: "Clear pricing", body: "Every fee is shown before you confirm. No hidden spreads in the fee table, no surprises on your statement." },
    { icon: Scale, title: "Honest about risk", body: "Crypto is volatile. We never promise returns, and we show a risk warning wherever you can invest." },
  ];
  return (
    <Container className="max-w-3xl py-16 sm:py-24">
      <h1 className="text-4xl font-semibold tracking-tight">About Orbtrade</h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        Orbtrade is a crypto brokerage: you buy, sell and swap digital assets with us at live market prices, from an
        account that&apos;s simple to use and serious about security.
      </p>
      {/* Placeholder: replace with the company's real story, registered entity and licensing details before launch. */}
      <p className="mt-4 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
        Company details, registration and licensing information will be published here before launch.
      </p>
      <div className="mt-12 grid gap-4">
        {values.map((v) => (
          <section key={v.title} className="glass flex gap-4 rounded-2xl p-5">
            <v.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <h2 className="font-semibold">{v.title}</h2>
              <p className="mt-1 text-sm text-muted">{v.body}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <ButtonLink href="/register">Create an account</ButtonLink>
        <ButtonLink href="/contact" variant="secondary">
          Contact us
        </ButtonLink>
      </div>
    </Container>
  );
}
