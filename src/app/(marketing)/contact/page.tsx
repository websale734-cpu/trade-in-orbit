import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, Phone, Rocket } from "lucide-react";
import { Container } from "@/components/ui/section";
import { siteConfig } from "@/config/site";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact", description: "How to reach Trade In Orbit." };

export default function ContactPage() {
  const rows = [
    { icon: MessageCircle, title: "Customers", body: "Sign in and use live chat or open a ticket. It's the fastest way, and we can see your account securely.", href: "/support", label: "Go to support" },
    { icon: Mail, title: "Email", body: siteConfig.supportEmail, href: `mailto:${siteConfig.supportEmail}`, label: "Email us" },
    ...(siteConfig.supportPhone
      ? [{ icon: Phone, title: "Phone", body: siteConfig.supportPhone, href: `tel:${siteConfig.supportPhone.replace(/[^\d+]/g, "")}`, label: "Call us" }]
      : []),
    { icon: Rocket, title: "Projects", body: "Want your coin listed on Trade In Orbit?", href: "/listing-request", label: "Request a listing" },
  ];
  return (
    <Container className="max-w-5xl py-16 sm:py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Contact us</h1>
      <p className="mt-4 text-muted">We never ask for your password or 2FA codes, by any channel.</p>
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
        <section aria-labelledby="contact-form-title" className="glass rounded-[var(--radius-card)] p-5 sm:p-8">
          <h2 id="contact-form-title" className="text-xl font-semibold">
            Send us a message
          </h2>
          <p className="mt-1.5 mb-6 text-sm text-muted">Our support team reads every message and replies by email.</p>
          <ContactForm />
        </section>
        <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {rows.map((r) => (
            <Link key={r.title} href={r.href} className="glass group rounded-2xl p-5 transition-colors hover:bg-surface-strong">
              <r.icon className="h-5 w-5 text-accent" />
              <p className="mt-3 font-semibold">{r.title}</p>
              <p className="mt-1 text-sm break-words text-muted">{r.body}</p>
              <p className="mt-3 text-sm font-medium text-accent group-hover:underline">{r.label} →</p>
            </Link>
          ))}
        </div>
      </div>
    </Container>
  );
}
