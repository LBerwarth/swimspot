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
  themeColor: "#0369a1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <div
          aria-hidden
          className="fixed inset-0 -z-10 bg-gradient-to-b from-[#dcf0fb] via-[#e8f5fc] to-[#c9e4f6]"
        />
        {children}
      </body>
    </html>
  );
}
