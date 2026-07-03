"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type {
  CountryIndex,
  Pool,
  PoolDataset,
  PoolWithDistance,
} from "@/lib/types";
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
import { useDict } from "@/components/locale-provider";

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

/** Marge autour de l'emprise d'un pays : couvre les zones frontalières. */
const BBOX_PADDING_DEG = 0.6;

function countriesFor(index: CountryIndex, loc: UserLocation): string[] {
  return index.countries
    .filter(({ bbox: [minLat, minLon, maxLat, maxLon] }) =>
      loc.lat >= minLat - BBOX_PADDING_DEG &&
      loc.lat <= maxLat + BBOX_PADDING_DEG &&
      loc.lon >= minLon - BBOX_PADDING_DEG &&
      loc.lon <= maxLon + BBOX_PADDING_DEG,
    )
    .map((c) => c.code);
}

export function FinderView() {
  const dict = useDict();
  const [index, setIndex] = useState<CountryIndex | null>(null);
  const [poolsByCountry, setPoolsByCountry] = useState<Map<string, Pool[]>>(
    () => new Map(),
  );
  const [loadError, setLoadError] = useState(false);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [lenFilter, setLenFilter] = useState<LenFilter>("all");
  const [openFilter, setOpenFilter] = useState<OpenFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favorites = useFavorites();
  const [listLimit, setListLimit] = useState(LIST_STEP);
  /** Piscine ciblée depuis la carte : mise en avant + défilement. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    // La recherche sauvegardée n'est restaurée qu'une fois l'index prêt :
    // la liste ne peut de toute façon rien afficher avant.
    fetch("/data/index.json")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: CountryIndex) => {
        setIndex(data);
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

  // Charge les fichiers des pays couvrant la position (zones frontalières :
  // plusieurs pays possibles). Les pays déjà chargés sont conservés.
  useEffect(() => {
    if (!index || !location) return;
    const missing = countriesFor(index, location).filter(
      (code) => !poolsByCountry.has(code),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((code) =>
        fetch(`/data/piscines-${code}.json`)
          .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
          .then((data: PoolDataset) => [code, data.pools] as const),
      ),
    )
      .then((loaded) => {
        if (cancelled) return;
        setPoolsByCountry((prev) => new Map([...prev, ...loaded]));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [index, location, poolsByCountry]);

  const allPools = useMemo(
    () => [...poolsByCountry.values()].flat(),
    [poolsByCountry],
  );

  const loadingPools =
    index !== null &&
    location !== null &&
    countriesFor(index, location).some((code) => !poolsByCountry.has(code));

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
    if (!location) return [];
    return allPools
      .map((pool) => ({
        ...pool,
        distanceKm: haversineKm(location.lat, location.lon, pool.lat, pool.lon),
      }))
      .filter((pool) => pool.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [allPools, location, radiusKm]);

  /** Piscines du rayon après filtres type/longueur/ouverture/favoris. */
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
      // Ouverture, selon les plannings connus (semaine type ou vacances
      // scolaires — on ne sait pas toujours lequel s'applique aujourd'hui).
      // « Maintenant » exige des horaires connus et ouverts ; « Aujourd'hui »
      // laisse le bénéfice du doute aux piscines sans horaires — il n'écarte
      // que celles dont on SAIT qu'elles sont fermées aujourd'hui.
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
        const parsed = pool.hours ? parseOpeningHours(pool.hours) : null;
        if (!parsed) return openFilter === "today";
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
    setSelectedId(null);
  };

  /** Clic sur un point de la carte : déplie la liste si besoin et défile. */
  const selectPool = useCallback(
    (id: string) => {
      const idx = displayed.findIndex((p) => p.id === id);
      if (idx < 0) return;
      if (idx >= listLimit) {
        setListLimit(Math.ceil((idx + 1) / LIST_STEP) * LIST_STEP);
      }
      setSelectedId(id);
    },
    [displayed, listLimit],
  );

  useEffect(() => {
    if (!selectedId) return;
    document
      .getElementById(`pool-${selectedId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId, listLimit]);

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

  const coveredCountries = index
    ? index.countries
        .map(
          (c) =>
            `${dict.countryNames[c.code] ?? c.code.toUpperCase()} (${c.count.toLocaleString()})`,
        )
        .join(" · ")
    : "";

  return (
    <div className="space-y-4">
      <LocationSearch value={location} onChange={(l) => changeFilters(() => setLocation(l))} />

      {((savedAddresses?.length ?? 0) > 0 || location) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={dict.savedAddressesAria}>
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
                aria-label={dict.removeAddress(address.label)}
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
            >
              {dict.saveAddress}{" "}
              « <span className="inline-block max-w-40 truncate align-bottom">{location.label}</span> »
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={dict.radiusAria}>
        <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">{dict.radiusLabel}</span>
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

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={dict.typeAria}>
          <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">{dict.typeLabel}</span>
          {(
            [
              ["all", dict.typeAll],
              ["int", dict.typeIndoor],
              ["ext", dict.typeOutdoor],
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
          aria-label={dict.openAria}
          title={dict.openTitle}
        >
          <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">{dict.openLabel}</span>
          {(
            [
              ["all", dict.openAll],
              ["now", dict.openNow],
              ["today", dict.openToday],
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

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={dict.favAria}>
          <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">{dict.favLabel}</span>
          {(
            [
              [false, dict.favAll],
              [true, dict.favOnly],
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

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={dict.lenAria}>
          <span className="w-20 shrink-0 text-xs font-medium text-violet-800/80">{dict.lenLabel}</span>
          {(
            [
              ["all", dict.lenAll],
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
          {dict.loadError}
        </p>
      )}

      {!location && !loadError && (
        <div className="rounded-2xl border border-dashed border-fuchsia-300 bg-white/60 px-5 py-8 text-center text-sm text-slate-600">
          <p className="text-2xl">🏊</p>
          <p className="mt-2 font-medium text-slate-800">{dict.emptyTitle}</p>
          <p className="mt-1">{dict.emptyHint}</p>
          {index && (
            <p className="mt-3 text-xs text-slate-400">
              {dict.coveredLabel} {coveredCountries}
            </p>
          )}
        </div>
      )}

      {location && center && (
        <>
          <PoolMap
            center={center}
            radiusKm={radiusKm}
            pools={displayed}
            onSelect={selectPool}
          />

          <p className="text-sm text-slate-600" aria-live="polite">
            {index === null || loadingPools
              ? dict.loadingPools
              : displayed.length === 0
                ? favoritesOnly
                  ? dict.noneFavorite
                  : dict.noneInRadius
                : dict.countLine(displayed.length, radiusKm, location.label)}
          </p>

          <div className="space-y-3">
            {displayed.slice(0, listLimit).map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                live={live?.get(pool.id) ?? null}
                selected={pool.id === selectedId}
              />
            ))}
          </div>

          {displayed.length > listLimit && (
            <button
              type="button"
              onClick={() => setListLimit((n) => n + LIST_STEP)}
              className="w-full rounded-xl bg-white/80 px-4 py-2.5 text-sm font-medium text-fuchsia-800 ring-1 ring-fuchsia-200 transition hover:bg-fuchsia-50"
            >
              {dict.showMore(displayed.length - listLimit)}
            </button>
          )}

          {index && (
            <p className="pt-2 text-center text-xs text-slate-400">
              {dict.coveredLabel} {coveredCountries}
            </p>
          )}
        </>
      )}
    </div>
  );
}
