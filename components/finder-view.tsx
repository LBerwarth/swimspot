"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { PoolDataset, PoolWithDistance } from "@/lib/types";
import { haversineKm } from "@/lib/geo";
import { isOpenAt, parseOpeningHours } from "@/lib/opening-hours";
import { fetchStreetDistancesKm } from "@/lib/street-distance";
import { LocationSearch, type UserLocation } from "@/components/location-search";
import { PoolCard } from "@/components/pool-card";

const PoolMap = dynamic(() => import("@/components/pool-map"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-2xl bg-fuchsia-100" />
  ),
});

const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 20, 50];
const LIST_STEP = 40;
const STORAGE_KEY = "pf:search";

type EnvFilter = "all" | "int" | "ext";
/** Classe de longueur de bassin : 25 = 25 à <50 m, 50 = 50 m et plus. */
type LenFilter = "all" | 25 | 50;
/** Ouverture : maintenant, à un moment aujourd'hui, ou peu importe. */
type OpenFilter = "all" | "now" | "today";

interface SavedSearch {
  location: UserLocation;
  radiusKm: number;
}

export function FinderView() {
  const [dataset, setDataset] = useState<PoolDataset | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [lenFilter, setLenFilter] = useState<LenFilter>("all");
  const [openFilter, setOpenFilter] = useState<OpenFilter>("all");
  const [listLimit, setListLimit] = useState(LIST_STEP);
  // Résultat OSRM, étiqueté par la recherche (position + rayon) qui l'a produit :
  // un résultat d'une recherche précédente est simplement ignoré.
  const [street, setStreet] = useState<{
    key: string;
    distances: Map<string, number>;
  } | null>(null);

  useEffect(() => {
    let saved: SavedSearch | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {
      // Stockage local corrompu ou indisponible : on repart de zéro.
    }
    // La recherche sauvegardée n'est restaurée qu'une fois les données prêtes :
    // la liste ne peut de toute façon rien afficher avant.
    fetch("/data/piscines.json")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: PoolDataset) => {
        setDataset(data);
        if (saved?.location) setLocation(saved.location);
        if (saved && RADIUS_OPTIONS_KM.includes(saved.radiusKm)) {
          setRadiusKm(saved.radiusKm);
        }
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!location) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ location, radiusKm } satisfies SavedSearch),
      );
    } catch {
      // Quota ou navigation privée : la persistance est optionnelle.
    }
  }, [location, radiusKm]);

  /** Piscines dans le rayon (à vol d'oiseau), triées par distance à vol d'oiseau. */
  const inRadius: PoolWithDistance[] = useMemo(() => {
    if (!dataset || !location) return [];
    return dataset.pools
      .map((pool) => ({
        ...pool,
        distanceKm: haversineKm(location.lat, location.lon, pool.lat, pool.lon),
      }))
      .filter((pool) => pool.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [dataset, location, radiusKm]);

  /** Piscines du rayon après filtres type/longueur. */
  const nearby: PoolWithDistance[] = useMemo(() => {
    return inRadius
      .filter((pool) =>
        envFilter === "all"
          ? true
          : pool.env === envFilter || pool.env === "mix",
      )
      // Longueur inconnue = piscine masquée par le filtre : on ne promet pas
      // un bassin de 25 m sans donnée.
      .filter((pool) => {
        if (lenFilter === "all") return true;
        const len = pool.len ?? 0;
        return lenFilter === 50 ? len >= 50 : len >= 25 && len < 50;
      })
      // Ouverture : horaires connus et ouverts selon au moins un des plannings
      // (semaine type ou vacances scolaires — on ne sait pas toujours lequel
      // s'applique aujourd'hui). Horaires inconnus = masquée.
      .filter((pool) => {
        if (openFilter === "all") return true;
        if (!pool.hours) return false;
        const parsed = parseOpeningHours(pool.hours);
        if (!parsed) return false;
        const now = new Date();
        const weeks = [
          parsed.week,
          ...(parsed.holidayWeek ? [parsed.holidayWeek] : []),
        ];
        if (openFilter === "now") {
          return weeks.some((week) => isOpenAt(week, now));
        }
        const day = (now.getDay() + 6) % 7;
        return weeks.some((week) => week[day].length > 0);
      });
  }, [inRadius, envFilter, lenFilter, openFilter]);

  const streetKey = useMemo(
    () => (location ? `${location.lat},${location.lon}:${radiusKm}` : ""),
    [location, radiusKm],
  );

  // Distances par la route (OSRM), calculées une fois par position + rayon —
  // les filtres type/longueur réutilisent le même résultat. En cas d'échec,
  // l'affichage retombe sur le vol d'oiseau.
  useEffect(() => {
    if (!location || inRadius.length === 0) return;
    const controller = new AbortController();
    fetchStreetDistancesKm(location, inRadius, controller.signal)
      .then((distances) => setStreet({ key: streetKey, distances }))
      .catch(() => {
        // Serveur de routage indisponible : distances à vol d'oiseau.
      });
    return () => controller.abort();
  }, [location, inRadius, streetKey]);

  const streetKm =
    street && street.key === streetKey ? street.distances : null;

  /** Liste affichée : distances route injectées, tri par distance route. */
  const displayed: PoolWithDistance[] = useMemo(() => {
    if (!streetKm) return nearby;
    return nearby
      .map((pool) => ({ ...pool, streetKm: streetKm.get(pool.id) }))
      .sort(
        (a, b) =>
          (a.streetKm ?? a.distanceKm) - (b.streetKm ?? b.distanceKm),
      );
  }, [nearby, streetKm]);

  const center = useMemo<[number, number] | null>(
    () => (location ? [location.lat, location.lon] : null),
    [location],
  );

  const changeFilters = (apply: () => void) => {
    apply();
    setListLimit(LIST_STEP);
  };

  return (
    <div className="space-y-4">
      <LocationSearch value={location} onChange={(l) => changeFilters(() => setLocation(l))} />

      <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rayon de recherche">
        <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">Rayon :</span>
        {RADIUS_OPTIONS_KM.map((km) => (
          <button
            key={km}
            type="button"
            onClick={() => changeFilters(() => setRadiusKm(km))}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              radiusKm === km
                ? "bg-fuchsia-600 text-white shadow-sm"
                : "bg-white/80 text-fuchsia-800 ring-1 ring-fuchsia-200 hover:bg-fuchsia-50"
            }`}
          >
            {km} km
          </button>
        ))}
      </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Type de piscine">
          <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">Type :</span>
          {(
            [
              ["all", "Toutes"],
              ["int", "Couvertes"],
              ["ext", "Plein air"],
            ] as Array<[EnvFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => changeFilters(() => setEnvFilter(key))}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                envFilter === key
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-white/80 text-violet-800 ring-1 ring-violet-200 hover:bg-violet-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Ouverture"
          title="D'après les horaires connus (une partie des piscines seulement)"
        >
          <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">Ouvertes :</span>
          {(
            [
              ["all", "Peu importe"],
              ["now", "Maintenant"],
              ["today", "Aujourd'hui"],
            ] as Array<[OpenFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => changeFilters(() => setOpenFilter(key))}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                openFilter === key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white/80 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Longueur de bassin">
          <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">Bassin :</span>
          {(
            [
              ["all", "Toutes longueurs"],
              [25, "25 m"],
              [50, "50 m"],
            ] as Array<[LenFilter, string]>
          ).map(([key, label]) => (
            <button
              key={String(key)}
              type="button"
              onClick={() => changeFilters(() => setLenFilter(key))}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                lenFilter === key
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-white/80 text-purple-800 ring-1 ring-purple-200 hover:bg-purple-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          Impossible de charger la liste des piscines. Rechargez la page.
        </p>
      )}

      {!location && !loadError && (
        <div className="rounded-2xl border border-dashed border-fuchsia-300 bg-white/60 px-5 py-8 text-center text-sm text-slate-600">
          <p className="text-2xl">🏊</p>
          <p className="mt-2 font-medium text-slate-800">Où cherchez-vous une piscine ?</p>
          <p className="mt-1">
            Touchez « 📍 Autour de moi » ou saisissez une adresse ci-dessus.
          </p>
          {dataset && (
            <p className="mt-3 text-xs text-slate-400">
              {dataset.count.toLocaleString("fr-FR")} piscines publiques
              référencées en France.
            </p>
          )}
        </div>
      )}

      {location && center && (
        <>
          <PoolMap center={center} radiusKm={radiusKm} pools={displayed} />

          <p className="text-sm text-slate-600" aria-live="polite">
            {dataset === null
              ? "Chargement des piscines…"
              : nearby.length === 0
                ? "Aucune piscine dans ce rayon — essayez un rayon plus grand."
                : `${nearby.length} piscine${nearby.length > 1 ? "s" : ""} dans un rayon de ${radiusKm} km autour de ${location.label}${
                    streetKm ? " · distances par la route" : " · distances à vol d'oiseau"
                  }.`}
          </p>

          <div className="space-y-3">
            {displayed.slice(0, listLimit).map((pool) => (
              <PoolCard key={pool.id} pool={pool} />
            ))}
          </div>

          {displayed.length > listLimit && (
            <button
              type="button"
              onClick={() => setListLimit((n) => n + LIST_STEP)}
              className="w-full rounded-xl bg-white/80 px-4 py-2.5 text-sm font-medium text-fuchsia-800 ring-1 ring-fuchsia-200 transition hover:bg-fuchsia-50"
            >
              Afficher plus ({displayed.length - listLimit} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
}
