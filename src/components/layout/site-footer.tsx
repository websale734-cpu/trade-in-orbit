import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/section";
import { getDictionary } from "@/i18n/server";

export async function SiteFooter() {
  const dict = await getDictionary();
  const f = dict.footer;
  const l = f.links;

  // Links to pages built in later phases point to anchors or placeholders for now.
  const columns = [
    {
      title: f.product,
      links: [
        { href: "/#markets", label: l.markets },
        { href: "/#fees", label: l.fees },
        { href: "/#security", label: l.security },
        { href: "/learn", label: l.learn },
      ],
    },
    {
      title: f.company,
      links: [
        { href: "/about", label: l.about },
        { href: "/blog", label: l.blog },
        { href: "/careers", label: l.careers },
      ],
    },
    {
      title: f.support,
      links: [
        { href: "/help", label: l.help },
        { href: "/contact", label: l.contact },
        { href: "/listing-request", label: l.listing },
      ],
    },
    {
      title: f.legal,
      links: [
        { href: "/legal/terms", label: l.terms },
        { href: "/legal/privacy", label: l.privacy },
        { href: "/legal/risk", label: l.risk },
        { href: "/legal/aml", label: l.aml },
      ],
    },
  ];

  return (
    <footer className="border-t border-line bg-bg-elevated/50">
      <Container className="py-14">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm text-muted">{f.tagline}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-4">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold">{col.title}</h3>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm text-muted transition-colors hover:text-fg">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-12 rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
          {f.riskWarning}
        </p>

        <p className="mt-6 text-xs text-subtle">
          © {new Date().getFullYear()} Orbtrade. {f.rights}
        </p>
      </Container>
    </footer>
  );
}
