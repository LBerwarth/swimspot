"use client";

import type { PoolWithDistance } from "@/lib/types";
import { formatDistance } from "@/lib/geo";
import {
  formatClosedPeriodFR,
  formatWeekFR,
  isInClosedPeriod,
  isOpenAt,
  parseOpeningHours,
  prettifyOpeningHours,
  type WeekSchedule,
} from "@/lib/opening-hours";
import {
  formatSlotTime,
  isOpenNowLive,
  type LivePoolStatus,
} from "@/lib/toulouse-live";
import { toggleFavorite, useFavorites } from "@/components/use-favorites";
import { useDict, useLocale } from "@/components/locale-provider";

function WeekLines({ week }: { week: WeekSchedule }) {
  const locale = useLocale();
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
      {formatWeekFR(week, locale).map((line) => (
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
  selected = false,
}: {
  pool: PoolWithDistance;
  live?: LivePoolStatus | null;
  selected?: boolean;
}) {
  const dict = useDict();
  const locale = useLocale();
  const favorites = useFavorites();
  const isFavorite = favorites.includes(pool.id);
  const parsed = pool.hours ? parseOpeningHours(pool.hours, locale) : null;
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
      ? dict.paidEntry
      : pool.fee === false
        ? dict.freeEntry
        : null;

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${pool.lat},${pool.lon}`;

  return (
    <article
      id={`pool-${pool.id}`}
      className={`scroll-mt-4 rounded-2xl border bg-white/90 p-4 shadow-sm transition ${
        selected
          ? "border-fuchsia-400 ring-2 ring-fuchsia-300"
          : "border-fuchsia-100/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold leading-snug text-slate-900">{pool.name}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {pool.address ? `${pool.address}, ` : ""}
            {pool.cp} {pool.city}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-xs font-semibold text-fuchsia-900"
            title={dict.distanceTitle}
          >
            {formatDistance(pool.distanceKm, locale)}
          </span>
          <button
            type="button"
            onClick={() => toggleFavorite(pool.id)}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? dict.favRemove(pool.name) : dict.favAdd(pool.name)}
            className={`text-lg leading-none transition ${
              isFavorite
                ? "text-amber-500 hover:text-amber-600"
                : "text-slate-300 hover:text-amber-400"
            }`}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(pool.lens ?? []).map((len) => (
          <span
            key={len}
            className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800"
          >
            {locale === "fr" ? String(len).replace(".", ",") : String(len)} m
          </span>
        ))}
        {pool.env && (
          <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[11px] font-medium text-fuchsia-700 ring-1 ring-fuchsia-200">
            {dict.envLabels[pool.env]}
          </span>
        )}
        {pool.basins.map((b) => (
          <span
            key={b}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
          >
            {dict.basinLabels[b] ?? dict.basinFallback(b)}
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
                  ? dict.badgeOpenNow
                  : dict.badgeClosedNow}
              </span>
            ) : (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                {dict.badgeClosedToday}
              </span>
            )}
            {live.openToday && live.slots.length > 0 && (
              <p className="mt-1.5 text-xs text-slate-700">
                <span className="font-medium">{dict.todayLabel}</span>{" "}
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
            <p className="mt-1 text-[10px] text-slate-400">{dict.liveSource}</p>
          </div>
        )}
        {!live &&
          (parsed ? (
          <div>
            {seasonalClosed ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                {dict.seasonalClosed}
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
                  {openNow ? dict.badgeOpenNow : dict.badgeClosedNow}
                </span>
              )
            )}
            {parsed.holidayWeek && (
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                {dict.schoolTerm}
              </p>
            )}
            <WeekLines week={parsed.week} />
            {parsed.holidayWeek && (
              <>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  {dict.schoolHolidays}
                </p>
                <WeekLines week={parsed.holidayWeek} />
              </>
            )}
            {(parsed.extras.length > 0 || parsed.closedPeriods.length > 0) && (
              <>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  {dict.specialPeriods}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                  {parsed.closedPeriods.map((period) => (
                    <li key={formatClosedPeriodFR(period, locale)}>
                      {formatClosedPeriodFR(period, locale)}
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
            <p className="font-medium">{dict.hoursLabel}</p>
            <ul className="mt-1 space-y-0.5">
              {prettifyOpeningHours(pool.hours, locale).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs italic text-slate-400">{dict.noHours}</p>
        ))}
        {tarif && (
          <p className="mt-1.5 text-xs text-slate-700">
            <span className="font-medium">{dict.priceLabel}</span> {tarif}
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
          {dict.directions}
        </a>
        {pool.website || live?.url ? (
          <a
            className="text-fuchsia-700 underline-offset-2 hover:underline"
            href={pool.website ?? live!.url}
            target="_blank"
            rel="noreferrer"
          >
            {dict.website}
          </a>
        ) : (
          <a
            className="text-fuchsia-700 underline-offset-2 hover:underline"
            href={`https://www.google.com/search?q=${encodeURIComponent(
              `${locale === "fr" ? "piscine" : "swimming pool"} ${pool.name} ${pool.city}`,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            {dict.searchWebsite}
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
