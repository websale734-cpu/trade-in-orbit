import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeScript } from "@/components/theme/theme-script";
import { I18nProvider } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { siteConfig } from "@/config/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: dict.meta.title, template: "%s · Orbtrade" },
    description: dict.meta.description,
    applicationName: "Orbtrade",
    openGraph: { title: dict.meta.title, description: dict.meta.description, siteName: "Orbtrade", type: "website" },
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

  return (
    // Dark is the default theme; ThemeScript swaps to the saved preference before paint.
    <html lang={locale} data-theme="dark" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
