import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/section";
import { legalPages, type LegalPage } from "@/config/site";
import { getDictionary } from "@/i18n/server";

/**
 * Legal pages: /legal/terms, /legal/privacy, /legal/risk, /legal/aml
 *
 * PLACEHOLDERS ONLY. Replace the outline below with text written and reviewed by
 * qualified legal counsel before launch. The headings are an indicative outline,
 * not legal advice.
 */
const outlines: Record<LegalPage, string[]> = {
  terms: [
    "Eligibility",
    "Your account",
    "Identity verification",
    "Deposits and withdrawals",
    "Trading and orders",
    "Fees",
    "Prohibited use",
    "Suspension and termination",
    "Liability",
    "Governing law",
    "Changes to these terms",
  ],
  privacy: [
    "Who we are",
    "Data we collect",
    "How we use your data",
    "Legal bases",
    "Sharing with third parties",
    "International transfers",
    "Retention",
    "Security",
    "Your rights",
    "Cookies",
    "Contact",
  ],
  risk: [
    "Volatility",
    "Loss of capital",
    "Liquidity",
    "Technology and cyber risk",
    "Regulatory risk",
    "Staking and rewards risk",
    "No investment advice",
    "Past performance",
  ],
  aml: [
    "Purpose",
    "Customer due diligence",
    "Verification levels and limits",
    "Ongoing monitoring",
    "Suspicious activity reporting",
    "Sanctions screening",
    "Record keeping",
    "Training and governance",
  ],
};

// Only the four legal pages exist; anything else is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return legalPages.map((slug) => ({ slug }));
}

function isLegalPage(slug: string): slug is LegalPage {
  return (legalPages as readonly string[]).includes(slug);
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  if (!isLegalPage(slug)) return {};
  const dict = await getDictionary();
  return { title: dict.legal.pages[slug] };
}

export default async function LegalPageView({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  if (!isLegalPage(slug)) notFound();
  const dict = await getDictionary();

  return (
    <Container className="max-w-3xl py-16 sm:py-24">
      <h1 className="text-4xl font-semibold tracking-tight">{dict.legal.pages[slug]}</h1>

      <div className="mt-8 flex gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <div>
          <p className="font-semibold">{dict.legal.placeholderTitle}</p>
          <p className="mt-1 text-muted">{dict.legal.placeholderBody}</p>
        </div>
      </div>

      <ol className="mt-10 space-y-8">
        {outlines[slug].map((heading, i) => (
          <li key={heading}>
            <h2 className="text-lg font-semibold">
              {i + 1}. {heading}
            </h2>
            <p className="mt-2 text-sm text-subtle italic">[To be completed by legal counsel.]</p>
          </li>
        ))}
      </ol>
    </Container>
  );
}
