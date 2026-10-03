import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, Phone, TicketCheck } from "lucide-react";
import { Container } from "@/components/ui/section";
import { Faq } from "@/components/landing/faq";
import { helpTopics } from "@/config/help";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Help centre", description: "Answers to common questions and ways to contact Trade In Orbit support." };

export default function HelpPage() {
  const contacts = [
    { icon: MessageCircle, title: "Live chat", body: "Fastest. Sign in and tap the chat button.", href: "/support?chat=1", label: "Start a chat" },
    { icon: TicketCheck, title: "Support ticket", body: "For anything that needs a detailed look.", href: "/support", label: "Open a ticket" },
    { icon: Mail, title: "Email", body: siteConfig.supportEmail, href: `mailto:${siteConfig.supportEmail}`, label: "Send an email" },
    ...(siteConfig.supportPhone
      ? [{ icon: Phone, title: "Phone", body: siteConfig.supportPhone, href: `tel:${siteConfig.supportPhone.replace(/[^\d+]/g, "")}`, label: "Call us" }]
      : []),
  ];

  return (
    <Container className="max-w-4xl py-16 sm:py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Help centre</h1>
      <p className="mt-3 text-muted">Find a quick answer below, or get in touch with our team.</p>

      <nav aria-label="Topics" className="mt-8 flex flex-wrap gap-2">
        {helpTopics.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="rounded-full border border-line bg-surface px-4 py-2 text-sm hover:bg-surface-strong">
            {t.title}
          </a>
        ))}
        <Link href="/faq" className="rounded-full border border-line bg-surface px-4 py-2 text-sm hover:bg-surface-strong">
          All FAQs
        </Link>
      </nav>

      <div className="mt-12 space-y-12">
        {helpTopics.map((t) => (
          <section key={t.id} id={t.id} className="scroll-mt-24">
            <h2 className="mb-4 text-xl font-semibold">{t.title}</h2>
            <Faq items={t.items} />
          </section>
        ))}
      </div>

      <section className="mt-16" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="text-xl font-semibold">
          Still need help?
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {contacts.map((c) => (
            <Link key={c.title} href={c.href} className="glass group rounded-2xl p-5 transition-colors hover:bg-surface-strong">
              <c.icon className="h-5 w-5 text-accent" />
              <p className="mt-3 font-semibold">{c.title}</p>
              <p className="mt-1 text-sm break-words text-muted">{c.body}</p>
              <p className="mt-3 text-sm font-medium text-accent group-hover:underline">{c.label} →</p>
            </Link>
          ))}
        </div>
      </section>
    </Container>
  );
}
