import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { Container } from "@/components/ui/section";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Careers", description: "Work at Trade In Orbit." };

export default function CareersPage() {
  return (
    <Container className="max-w-3xl py-16 sm:py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Careers</h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        We&apos;re building a crypto brokerage people can trust. If you care about security, clear design and doing
        things properly, we&apos;d like to hear from you.
      </p>
      <section className="glass mt-10 rounded-2xl p-6 text-center">
        <Briefcase className="mx-auto h-8 w-8 text-accent" />
        <h2 className="mt-4 font-semibold">No open roles right now</h2>
        <p className="mt-2 text-sm text-muted">
          Send your CV and a short note to{" "}
          <a className="text-accent hover:underline" href={`mailto:${siteConfig.supportEmail}?subject=Careers`}>
            {siteConfig.supportEmail}
          </a>{" "}
          and we&apos;ll keep you in mind.
        </p>
      </section>
    </Container>
  );
}
