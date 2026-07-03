import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Piscines de France — trouvez une piscine près de chez vous",
  description:
    "Toutes les piscines publiques de France autour de vous : choisissez un rayon, " +
    "voyez les bassins, horaires et tarifs disponibles, avec carte et itinéraires.",
  applicationName: "Piscines de France",
};

export const viewport: Viewport = {
  themeColor: "#6D28D9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${outfit.variable} h-full antialiased`}>
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
        {children}
      </body>
    </html>
  );
}
