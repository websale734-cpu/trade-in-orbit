import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { ThemeScript } from "@/components/theme/theme-script";
import { NonceProvider } from "@/components/security/nonce";
import { PwaSetup } from "@/components/pwa/pwa-setup";
import { I18nProvider } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { localeDir } from "@/i18n/config";
import { siteConfig } from "@/config/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: dict.meta.title, template: "%s · Trade In Orbit" },
    description: dict.meta.description,
    applicationName: "Trade In Orbit",
    // Installed on an iPhone home screen: full screen, dark status bar, short name under the icon.
    appleWebApp: { capable: true, title: "Trade In Orbit", statusBarStyle: "black" },
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      siteName: "Trade In Orbit",
      type: "website",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07070c" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6fb" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // Dark is the default theme; ThemeScript swaps to the saved preference before paint.
    <html
      lang={locale}
      dir={localeDir(locale)}
      data-theme="dark"
      className={`${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="flex min-h-full flex-col">
        <NonceProvider nonce={nonce}>
          <I18nProvider locale={locale} dict={dict}>
            {children}
            <PwaSetup />
          </I18nProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
