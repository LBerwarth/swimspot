import { FinderView } from "@/components/finder-view";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:pt-8">
      <header className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-fuchsia-600 to-violet-800 px-5 py-6 text-white shadow-lg shadow-pink-200/60 sm:px-7 sm:py-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Piscines de France
        </h1>
        <p className="mt-2 text-sm text-white/90 sm:text-base">
          Trouvez les piscines publiques autour de vous : bassins, horaires et
          tarifs quand ils sont connus.
        </p>
      </header>

      <FinderView />

      <footer className="mt-12 space-y-1 text-center text-xs text-slate-500">
        <p>
          Données :{" "}
          <a
            className="underline hover:text-fuchsia-700"
            href="https://equipements.sports.gouv.fr"
            target="_blank"
            rel="noreferrer"
          >
            Data ES — ministère des Sports
          </a>{" "}
          (licence ouverte) ·{" "}
          <a
            className="underline hover:text-fuchsia-700"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © les contributeurs d’OpenStreetMap
          </a>{" "}
          (ODbL) · itinéraires{" "}
          <a
            className="underline hover:text-fuchsia-700"
            href="https://project-osrm.org"
            target="_blank"
            rel="noreferrer"
          >
            OSRM
          </a>
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
