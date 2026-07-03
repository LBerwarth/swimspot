import { FinderView } from "@/components/finder-view";
import { getDict, isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { notFound } from "next/navigation";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = getDict(locale);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:pt-8">
      <header className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-fuchsia-600 to-violet-800 px-5 py-6 text-white shadow-lg shadow-pink-200/60 sm:px-7 sm:py-8">
        <nav
          className="absolute right-4 top-4 flex gap-1 text-xs font-semibold"
          aria-label="Langue / Language"
        >
          {LOCALES.map((code) => (
            <a
              key={code}
              href={`/${code}`}
              aria-current={code === locale ? "page" : undefined}
              className={`rounded-full px-2 py-0.5 uppercase transition ${
                code === locale
                  ? "bg-white/90 text-fuchsia-700"
                  : "bg-white/20 text-white hover:bg-white/40"
              }`}
            >
              {code}
            </a>
          ))}
        </nav>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Swimspot
        </h1>
        <p className="mt-2 text-sm text-white/90 sm:text-base">
          {dict.subtitle}
        </p>
      </header>

      <FinderView />

      <footer className="mt-12 space-y-1 text-center text-xs text-slate-500">
        <p>
          {dict.footerData}{" "}
          <a
            className="underline hover:text-fuchsia-700"
            href="https://equipements.sports.gouv.fr"
            target="_blank"
            rel="noreferrer"
          >
            Data ES
          </a>{" "}
          {dict.footerLicenceFR} ·{" "}
          <a
            className="underline hover:text-fuchsia-700"
            href="https://www.activeplacespower.com"
            target="_blank"
            rel="noreferrer"
          >
            Active Places
          </a>{" "}
          {dict.footerLicenceGB} ·{" "}
          <a
            className="underline hover:text-fuchsia-700"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            {dict.footerOsm}
          </a>{" "}
          (ODbL)
        </p>
        <p>{dict.footerDisclaimer}</p>
      </footer>
    </main>
  );
}
