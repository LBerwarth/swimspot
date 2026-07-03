import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Outfit } from "next/font/google";
import "../globals.css";
import { getDict, isLocale, LOCALES } from "@/lib/i18n";
import { LocaleProvider } from "@/components/locale-provider";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDict(locale);
  return {
    title: dict.metaTitle,
    description: dict.metaDescription,
    applicationName: "Swimspot",
  };
}

export const viewport: Viewport = {
  themeColor: "#6D28D9",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Photo d'eau de piscine en fond, adoucie pour la lisibilité */}
        <div
          aria-hidden
          className="fixed inset-0 -z-10 bg-[url('/eau.jpg')] bg-cover bg-center"
        />
        <div
          aria-hidden
          className="fixed inset-0 -z-10 bg-gradient-to-b from-[#e4f0fc]/86 via-[#cfe2f7]/93 to-[#bcd6f0]/98"
        />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
