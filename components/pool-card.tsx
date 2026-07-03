"use client";

import type { PoolWithDistance } from "@/lib/types";
import { formatDistance } from "@/lib/geo";
import {
  formatSlotTime,
  isOpenNowLive,
  type LivePoolStatus,
} from "@/lib/toulouse-live";
import {
  formatClosedPeriodFR,
  formatWeekFR,
  isInClosedPeriod,
  isOpenAt,
  parseOpeningHours,
  prettifyOpeningHours,
  type WeekSchedule,
} from "@/lib/opening-hours";

const ENV_LABELS: Record<string, string> = {
  int: "Couverte",
  ext: "Plein air",
  mix: "Couverte + plein air",
};

function WeekLines({ week }: { week: WeekSchedule }) {
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
      {formatWeekFR(week).map((line) => (
        <li key={line.days} className="flex gap-2">
          <span className="w-16 shrink-0 font-medium">{line.days}</span>
          <span>{line.hours}</span>
        </li>
      ))}
    </ul>
  );
}

export function PoolCard({
  pool,
  live = null,
}: {
  pool: PoolWithDistance;
  live?: LivePoolStatus | null;
}) {
  const parsed = pool.hours ? parseOpeningHours(pool.hours) : null;
  // Fermeture saisonnière en cours (ex. piscine d'hiver fermée l'été) :
  // prime sur tout le reste.
  const seasonalClosed = parsed
    ? isInClosedPeriod(parsed.closedPeriods, new Date())
    : false;
  // Le badge « ouverte/fermée » n'est affiché que si la semaine type suffit :
  // avec des horaires de vacances scolaires ou des périodes datées, on ne sait
  // pas quel planning s'applique aujourd'hui.
  const certain =
    parsed !== null && !parsed.holidayWeek && parsed.extras.length === 0;
  const openNow =
    certain && parsed ? isOpenAt(parsed.week, new Date()) : null;

  const tarif = pool.charge
    ? pool.charge
    : pool.fee === true
      ? "Entrée payante"
      : pool.fee === false
        ? "Accès gratuit"
        : null;

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${pool.lat},${pool.lon}`;

  return (
    <article className="rounded-2xl border border-fuchsia-100/60 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold leading-snug text-slate-900">{pool.name}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {pool.address ? `${pool.address}, ` : ""}
            {pool.cp} {pool.city}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full bg-fuchsia-100 px-2.5 py-1 text-xs font-semibold text-fuchsia-900"
          title="Distance à vol d'oiseau"
        >
          {formatDistance(pool.distanceKm)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(pool.lens ?? []).map((len) => (
          <span
            key={len}
            className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800"
          >
            {String(len).replace(".", ",")} m
          </span>
        ))}
        {pool.env && (
          <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[11px] font-medium text-fuchsia-700 ring-1 ring-fuchsia-200">
            {ENV_LABELS[pool.env]}
          </span>
        )}
        {pool.basins.map((b) => (
          <span
            key={b}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
          >
            bassin {b}
          </span>
        ))}
      </div>

      <div className="mt-3 text-sm">
        {live && (
          <div className="mb-2">
            {live.openToday ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isOpenNowLive(live, new Date())
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {isOpenNowLive(live, new Date())
                  ? "Ouverte en ce moment"
                  : "Fermée en ce moment"}
              </span>
            ) : (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                Fermée aujourd&apos;hui
              </span>
            )}
            {live.openToday && live.slots.length > 0 && (
              <p className="mt-1.5 text-xs text-slate-700">
                <span className="font-medium">Aujourd&apos;hui :</span>{" "}
                {live.slots
                  .map(
                    (s) => `${formatSlotTime(s.start)}–${formatSlotTime(s.end)}`,
                  )
                  .join(", ")}
              </p>
            )}
            {!live.openToday && live.closureReason && (
              <p className="mt-1.5 text-xs text-rose-800/90">{live.closureReason}</p>
            )}
            <p className="mt-1 text-[10px] text-slate-400">
              Statut du jour en direct — metropole.toulouse.fr
            </p>
          </div>
        )}
        {!live &&
          (parsed ? (
          <div>
            {seasonalClosed ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                Fermeture saisonnière en cours
              </span>
            ) : (
              openNow !== null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    openNow
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {openNow ? "Ouverte en ce moment" : "Fermée en ce moment"}
                </span>
              )
            )}
            {parsed.holidayWeek && (
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                Période scolaire
              </p>
            )}
            <WeekLines week={parsed.week} />
            {parsed.holidayWeek && (
              <>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  Vacances scolaires
                </p>
                <WeekLines week={parsed.holidayWeek} />
              </>
            )}
            {(parsed.extras.length > 0 || parsed.closedPeriods.length > 0) && (
              <>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  Périodes particulières
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                  {parsed.closedPeriods.map((period) => (
                    <li key={formatClosedPeriodFR(period)}>
                      {formatClosedPeriodFR(period)}
                    </li>
                  ))}
                  {parsed.extras.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : pool.hours ? (
          <div className="text-xs text-slate-700">
            <p className="font-medium">Horaires :</p>
            <ul className="mt-1 space-y-0.5">
              {prettifyOpeningHours(pool.hours).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs italic text-slate-400">
            Horaires non renseignés — vérifiez sur le site officiel.
          </p>
        ))}
        {tarif && (
          <p className="mt-1.5 text-xs text-slate-700">
            <span className="font-medium">Tarif :</span> {tarif}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
        <a
          className="text-fuchsia-700 underline-offset-2 hover:underline"
          href={directions}
          target="_blank"
          rel="noreferrer"
        >
          Itinéraire ↗
        </a>
        {pool.website || live?.url ? (
          <a
            className="text-fuchsia-700 underline-offset-2 hover:underline"
            href={pool.website ?? live!.url}
            target="_blank"
            rel="noreferrer"
          >
            Site web ↗
          </a>
        ) : (
          <a
            className="text-fuchsia-700 underline-offset-2 hover:underline"
            href={`https://www.google.com/search?q=${encodeURIComponent(
              `piscine ${pool.name} ${pool.city} horaires tarifs`,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            Rechercher le site ↗
          </a>
        )}
        {pool.phone && (
          <a
            className="text-fuchsia-700 underline-offset-2 hover:underline"
            href={`tel:${pool.phone.replace(/\s/g, "")}`}
          >
            {pool.phone}
          </a>
        )}
      </div>
    </article>
  );
}
