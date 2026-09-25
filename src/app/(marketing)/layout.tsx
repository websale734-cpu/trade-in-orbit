import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PromoBanner } from "@/components/layout/promo-banner";
import { getActivePromotion } from "@/server/content";

/** Shell for public (signed-out) pages: promotion strip, header, footer. */
export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const promo = await getActivePromotion();
  return (
    <>
      {promo && <PromoBanner promo={promo} />}
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
