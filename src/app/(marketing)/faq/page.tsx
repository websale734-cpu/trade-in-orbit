import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/section";
import { Faq } from "@/components/landing/faq";
import { helpTopics } from "@/config/help";
import { getFaq } from "@/server/content";
import { getDictionary } from "@/i18n/server";

export const metadata: Metadata = { title: "FAQ", description: "Frequently asked questions about Orbtrade." };

export default async function FaqPage() {
  const [dict, managed] = await Promise.all([getDictionary(), getFaq()]);
  const general = managed ?? dict.faq.items;
  return (
    <Container className="max-w-3xl py-16 sm:py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Frequently asked questions</h1>
      <p className="mt-3 text-muted">
        Can&apos;t find your answer? Visit the{" "}
        <Link href="/help" className="text-accent hover:underline">
          help centre
        </Link>{" "}
        to contact us.
      </p>
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold">General</h2>
        <Faq items={general} />
      </section>
      {helpTopics.map((t) => (
        <section key={t.id} className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">{t.title}</h2>
          <Faq items={t.items} />
        </section>
      ))}
    </Container>
  );
}
