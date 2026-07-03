"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { PoolDataset, PoolWithDistance } from "@/lib/types";
import { haversineKm } from "@/lib/geo";
import { LocationSearch, type UserLocation } from "@/components/location-search";
import { PoolCard } from "@/components/pool-card";

const PoolMap = dynamic(() => import("@/components/pool-map"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-2xl bg-sky-100" />
  ),
});

const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 20, 50];
const LIST_STEP = 40;
const STORAGE_KEY = "pf:search";

type EnvFilter = "all" | "int" | "ext";
/** Classe de longueur de bassin : 25 = 25 à <50 m, 50 = 50 m et plus. */
type LenFilter = "all" | 25 | 50;

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
  const [listLimit, setListLimit] = useState(LIST_STEP);

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

  const nearby: PoolWithDistance[] = useMemo(() => {
    if (!dataset || !location) return [];
    return dataset.pools
      .map((pool) => ({
        ...pool,
        distanceKm: haversineKm(location.lat, location.lon, pool.lat, pool.lon),
      }))
      .filter((pool) => pool.distanceKm <= radiusKm)
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
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [dataset, location, radiusKm, envFilter, lenFilter]);

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

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rayon de recherche">
        <span className="mr-1 text-xs font-medium text-sky-900/70">Rayon :</span>
        {RADIUS_OPTIONS_KM.map((km) => (
          <button
            key={km}
            type="button"
            onClick={() => changeFilters(() => setRadiusKm(km))}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              radiusKm === km
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-white/80 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-50"
            }`}
          >
            {km} km
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Type de piscine">
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
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-white/80 text-cyan-800 ring-1 ring-cyan-200 hover:bg-cyan-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Longueur de bassin">
          <span className="text-xs font-medium text-sky-900/70">Bassin :</span>
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
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white/80 text-indigo-800 ring-1 ring-indigo-200 hover:bg-indigo-50"
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
        <div className="rounded-2xl border border-dashed border-sky-300 bg-white/60 px-5 py-8 text-center text-sm text-sky-900/70">
          <p className="text-2xl">🏊</p>
          <p className="mt-2 font-medium">Où cherchez-vous une piscine ?</p>
          <p className="mt-1">
            Touchez « 📍 Autour de moi » ou saisissez une adresse ci-dessus.
          </p>
          {dataset && (
            <p className="mt-3 text-xs text-sky-900/50">
              {dataset.count.toLocaleString("fr-FR")} piscines publiques
              référencées en France.
            </p>
          )}
        </div>
      )}

      {location && center && (
        <>
          <PoolMap center={center} radiusKm={radiusKm} pools={nearby} />

          <p className="text-sm text-sky-900/80" aria-live="polite">
            {dataset === null
              ? "Chargement des piscines…"
              : nearby.length === 0
                ? "Aucune piscine dans ce rayon — essayez un rayon plus grand."
                : `${nearby.length} piscine${nearby.length > 1 ? "s" : ""} à moins de ${radiusKm} km de ${location.label}.`}
          </p>

          <div className="space-y-3">
            {nearby.slice(0, listLimit).map((pool) => (
              <PoolCard key={pool.id} pool={pool} />
            ))}
          </div>

          {nearby.length > listLimit && (
            <button
              type="button"
              onClick={() => setListLimit((n) => n + LIST_STEP)}
              className="w-full rounded-xl bg-white/80 px-4 py-2.5 text-sm font-medium text-sky-800 ring-1 ring-sky-200 transition hover:bg-sky-50"
            >
              Afficher plus ({nearby.length - listLimit} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
}
