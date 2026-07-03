"use client";

import type { PoolWithDistance } from "@/lib/types";
import { formatDistance } from "@/lib/geo";
import {
  formatWeekFR,
  isOpenAt,
  parseOpeningHours,
} from "@/lib/opening-hours";

const ENV_LABELS: Record<string, string> = {
  int: "Couverte",
  ext: "Plein air",
  mix: "Couverte + plein air",
};

export function PoolCard({ pool }: { pool: PoolWithDistance }) {
  const week = pool.hours ? parseOpeningHours(pool.hours) : null;
  const openNow = week ? isOpenAt(week, new Date()) : null;

  const tarif = pool.charge
    ? pool.charge
    : pool.fee === true
      ? "Entrée payante"
      : pool.fee === false
        ? "Accès gratuit"
        : null;

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${pool.lat},${pool.lon}`;

  return (
    <article className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold leading-snug text-sky-950">{pool.name}</h2>
          <p className="mt-0.5 text-xs text-sky-900/60">
            {pool.address ? `${pool.address}, ` : ""}
            {pool.cp} {pool.city}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
          {formatDistance(pool.distanceKm)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {pool.env && (
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-800 ring-1 ring-cyan-200">
            {ENV_LABELS[pool.env]}
          </span>
        )}
        {pool.basins.map((b) => (
          <span
            key={b}
            className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 ring-1 ring-sky-200"
          >
            bassin {b}
          </span>
        ))}
      </div>

      <div className="mt-3 text-sm">
        {week ? (
          <div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                openNow
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {openNow ? "Ouverte en ce moment" : "Fermée en ce moment"}
            </span>
            <ul className="mt-2 space-y-0.5 text-xs text-sky-950/80">
              {formatWeekFR(week).map((line) => (
                <li key={line.days} className="flex gap-2">
                  <span className="w-16 shrink-0 font-medium">{line.days}</span>
                  <span>{line.hours}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : pool.hours ? (
          <p className="text-xs text-sky-950/80">
            <span className="font-medium">Horaires :</span> {pool.hours}
          </p>
        ) : (
          <p className="text-xs italic text-sky-900/50">
            Horaires non renseignés — vérifiez sur le site officiel.
          </p>
        )}
        {tarif && (
          <p className="mt-1.5 text-xs text-sky-950/80">
            <span className="font-medium">Tarif :</span> {tarif}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
        <a
          className="text-sky-700 underline-offset-2 hover:underline"
          href={directions}
          target="_blank"
          rel="noreferrer"
        >
          Itinéraire ↗
        </a>
        {pool.website && (
          <a
            className="text-sky-700 underline-offset-2 hover:underline"
            href={pool.website}
            target="_blank"
            rel="noreferrer"
          >
            Site web ↗
          </a>
        )}
        {pool.phone && (
          <a
            className="text-sky-700 underline-offset-2 hover:underline"
            href={`tel:${pool.phone.replace(/\s/g, "")}`}
          >
            {pool.phone}
          </a>
        )}
      </div>
    </article>
  );
}
