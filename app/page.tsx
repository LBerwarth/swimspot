import { FinderView } from "@/components/finder-view";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-8 sm:pt-12">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-sky-900 sm:text-4xl">
          Piscines de France
        </h1>
        <p className="mt-2 text-sm text-sky-800/80 sm:text-base">
          Trouvez les piscines publiques autour de vous : bassins, horaires et
          tarifs quand ils sont connus.
        </p>
      </header>

      <FinderView />

      <footer className="mt-12 space-y-1 text-center text-xs text-sky-900/60">
        <p>
          Données :{" "}
          <a
            className="underline hover:text-sky-700"
            href="https://equipements.sports.gouv.fr"
            target="_blank"
            rel="noreferrer"
          >
            Data ES — ministère des Sports
          </a>{" "}
          (licence ouverte) ·{" "}
          <a
            className="underline hover:text-sky-700"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © les contributeurs d’OpenStreetMap
          </a>{" "}
          (ODbL)
        </p>
        <p>
          Horaires et tarifs issus d’OpenStreetMap : disponibles pour une partie
          des piscines seulement — vérifiez sur le site officiel avant de vous
          déplacer.
        </p>
      </footer>
    </main>
  );
}
