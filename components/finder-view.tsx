"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { PoolDataset, PoolWithDistance } from "@/lib/types";
import { haversineKm } from "@/lib/geo";
import {
  isInClosedPeriod,
  isOpenAt,
  parseOpeningHours,
} from "@/lib/opening-hours";
import {
  fetchToulouseLive,
  isOpenNowLive,
  type LivePoolStatus,
} from "@/lib/toulouse-live";
import { LocationSearch, type UserLocation } from "@/components/location-search";
import { PoolCard } from "@/components/pool-card";
import { useFavorites } from "@/components/use-favorites";

const PoolMap = dynamic(() => import("@/components/pool-map"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-2xl bg-fuchsia-100" />
  ),
});

const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 20, 50];
const LIST_STEP = 40;
const STORAGE_KEY = "pf:search";
const ADDRESSES_KEY = "pf:addresses";
const MAX_SAVED_ADDRESSES = 8;

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
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favorites = useFavorites();
  const [listLimit, setListLimit] = useState(LIST_STEP);
  // null = pas encore chargées depuis localStorage : l'effet de persistance
  // ne doit pas écraser la liste stockée avec un tableau vide au montage.
  const [savedAddresses, setSavedAddresses] = useState<UserLocation[] | null>(
    null,
  );
  // Statut du jour en direct (piscines de Toulouse), superposé aux données OSM.
  const [live, setLive] = useState<Map<string, LivePoolStatus> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchToulouseLive(controller.signal)
      .then(setLive)
      .catch(() => {
        // Service indisponible : on reste sur les horaires OSM.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let saved: SavedSearch | null = null;
    let addresses: UserLocation[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      const rawAddresses = JSON.parse(
        localStorage.getItem(ADDRESSES_KEY) ?? "[]",
      );
      if (Array.isArray(rawAddresses)) addresses = rawAddresses;
    } catch {
      // Stockage local corrompu ou indisponible : on repart de zéro.
    }
    // La recherche sauvegardée n'est restaurée qu'une fois les données prêtes :
    // la liste ne peut de toute façon rien afficher avant.
    fetch("/data/piscines.json")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: PoolDataset) => {
        setDataset(data);
        setSavedAddresses(addresses);
        if (saved?.location) setLocation(saved.location);
        if (saved && RADIUS_OPTIONS_KM.includes(saved.radiusKm)) {
          setRadiusKm(saved.radiusKm);
        }
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (savedAddresses === null) return;
    try {
      localStorage.setItem(ADDRESSES_KEY, JSON.stringify(savedAddresses));
    } catch {
      // Quota ou navigation privée : la persistance est optionnelle.
    }
  }, [savedAddresses]);

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
      .filter((pool) => !favoritesOnly || favorites.includes(pool.id))
      .filter((pool) =>
        envFilter === "all"
          ? true
          : pool.env === envFilter || pool.env === "mix",
      )
      // Longueur inconnue = piscine masquée par le filtre : on ne promet pas
      // un bassin de 25 m sans donnée. Une piscine à plusieurs bassins passe
      // le filtre dès qu'UN bassin correspond (25 m = 25 à <50 m).
      .filter((pool) => {
        if (lenFilter === "all") return true;
        const lens = pool.lens ?? [];
        return lenFilter === 50
          ? lens.some((l) => l >= 50)
          : lens.some((l) => l >= 25 && l < 50);
      })
      // Ouverture : horaires connus et ouverts selon au moins un des plannings
      // (semaine type ou vacances scolaires — on ne sait pas toujours lequel
      // s'applique aujourd'hui). Horaires inconnus = masquée.
      .filter((pool) => {
        if (openFilter === "all") return true;
        const now = new Date();
        // Statut live (Toulouse) : source la plus fiable, prime sur OSM.
        const liveStatus = live?.get(pool.id);
        if (liveStatus) {
          return openFilter === "now"
            ? isOpenNowLive(liveStatus, now)
            : liveStatus.openToday;
        }
        if (!pool.hours) return false;
        const parsed = parseOpeningHours(pool.hours);
        if (!parsed) return false;
        // Fermeture saisonnière en cours (ex. piscine d'hiver l'été).
        if (isInClosedPeriod(parsed.closedPeriods, now)) return false;
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
  }, [inRadius, envFilter, lenFilter, openFilter, live, favoritesOnly, favorites]);

  // Distance à vol d'oiseau partout : simple, cohérente avec le cercle de la
  // carte (les distances routières testées se sont révélées peu intuitives).
  const displayed = nearby;

  const center = useMemo<[number, number] | null>(
    () => (location ? [location.lat, location.lon] : null),
    [location],
  );

  const changeFilters = (apply: () => void) => {
    apply();
    setListLimit(LIST_STEP);
  };

  const isCurrentSaved =
    location !== null &&
    (savedAddresses ?? []).some((a) => a.label === location.label);

  const saveCurrentAddress = () => {
    if (!location || isCurrentSaved) return;
    setSavedAddresses((prev) =>
      [location, ...(prev ?? [])].slice(0, MAX_SAVED_ADDRESSES),
    );
  };

  const removeAddress = (label: string) => {
    setSavedAddresses((prev) => (prev ?? []).filter((a) => a.label !== label));
  };

  return (
    <div className="space-y-4">
      <LocationSearch value={location} onChange={(l) => changeFilters(() => setLocation(l))} />

      {((savedAddresses?.length ?? 0) > 0 || location) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Adresses enregistrées">
          {(savedAddresses ?? []).map((address) => (
            <span
              key={address.label}
              className={`flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold transition ${
                location?.label === address.label
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-white/80 text-violet-800 ring-1 ring-violet-200"
              }`}
            >
              <button
                type="button"
                onClick={() => changeFilters(() => setLocation(address))}
                className="max-w-52 truncate"
                title={address.label}
              >
                {address.label}
              </button>
              <button
                type="button"
                onClick={() => removeAddress(address.label)}
                aria-label={`Supprimer l'adresse ${address.label}`}
                className={`rounded-full px-1 leading-none ${
                  location?.label === address.label
                    ? "hover:bg-violet-500"
                    : "hover:bg-violet-100"
                }`}
              >
                ×
              </button>
            </span>
          ))}
          {location && !isCurrentSaved && savedAddresses !== null && (
            <button
              type="button"
              onClick={saveCurrentAddress}
              className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-fuchsia-800 ring-1 ring-dashed ring-fuchsia-300 transition hover:bg-fuchsia-50"
              title="Garder cette adresse sous la main"
            >
              ☆ Enregistrer « <span className="inline-block max-w-40 truncate align-bottom">{location.label}</span> »
            </button>
          )}
        </div>
      )}

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
                  ? "bg-pink-600 text-white shadow-sm"
                  : "bg-white/80 text-pink-800 ring-1 ring-pink-200 hover:bg-pink-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Favoris">
          <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">Favoris :</span>
          {(
            [
              [false, "Toutes"],
              [true, "★ Uniquement"],
            ] as Array<[boolean, string]>
          ).map(([key, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => changeFilters(() => setFavoritesOnly(key))}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                favoritesOnly === key
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-white/80 text-amber-700 ring-1 ring-amber-300 hover:bg-amber-50"
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
              : displayed.length === 0
                ? favoritesOnly
                  ? "Aucune piscine favorite dans ce rayon — touchez ☆ sur une piscine pour l'ajouter."
                  : "Aucune piscine dans ce rayon — essayez un rayon plus grand."
                : `${displayed.length} piscine${displayed.length > 1 ? "s" : ""} à moins de ${radiusKm} km à vol d'oiseau de ${location.label}.`}
          </p>

          <div className="space-y-3">
            {displayed.slice(0, listLimit).map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                live={live?.get(pool.id) ?? null}
              />
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
