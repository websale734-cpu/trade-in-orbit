import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { getDictionary } from "@/i18n/server";

/**
 * Temporary "under construction" pages for links that exist in the header/footer
 * but are built in later phases. Each real route (e.g. app/(marketing)/login/page.tsx)
 * takes precedence over this dynamic segment as soon as it's added, so remove
 * slugs here as they're implemented.
 */
const upcoming: Record<string, { title: string; phase: number }> = {
  about: { title: "About", phase: 7 },
  careers: { title: "Careers", phase: 7 },
  blog: { title: "Blog", phase: 7 },
  learn: { title: "Learn", phase: 7 },
  help: { title: "Help centre", phase: 7 },
  contact: { title: "Contact", phase: 7 },
  "listing-request": { title: "Request a listing", phase: 7 },
};

// Unknown slugs get a real 404 status from the router (notFound() inside a
// streamed page would render the 404 UI but with a 200 status).
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(upcoming).map((page) => ({ page }));
}

export async function generateMetadata({ params }: PageProps<"/[page]">) {
  const info = upcoming[(await params).page];
  return info ? { title: info.title } : {};
}

export default async function UpcomingPage({ params }: PageProps<"/[page]">) {
  const info = upcoming[(await params).page];
  if (!info) notFound();
  const dict = await getDictionary();

  return (
    <Container className="grid place-items-center py-28 text-center">
      <div className="glass max-w-md rounded-[var(--radius-card)] p-10">
        <Construction className="mx-auto h-10 w-10 text-accent" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{info.title}</h1>
        <p className="mt-3 text-sm text-muted">
          {dict.placeholder.body} (Phase {info.phase})
        </p>
        <ButtonLink href="/" variant="secondary" className="mt-8">
          {dict.common.backHome}
        </ButtonLink>
      </div>
    </Container>
  );
}
