"use client";

import { useEffect, useRef, useState } from "react";

export interface UserLocation {
  lat: number;
  lon: number;
  label: string;
}

interface Suggestion {
  label: string;
  lat: number;
  lon: number;
}

interface Props {
  value: UserLocation | null;
  onChange: (location: UserLocation) => void;
}

/**
 * Champ « où ? » : géolocalisation du navigateur ou recherche d'adresse via
 * l'API adresse nationale (api-adresse.data.gouv.fr, gratuite, France).
 */
export function LocationSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const search = (q: string) => {
    setQuery(q);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      // Deux géocodeurs en parallèle : l'API adresse nationale (meilleure sur
      // les adresses françaises) et Photon (couverture européenne, base OSM).
      const [adresse, photon] = await Promise.allSettled([
        fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=4`,
        ).then((res) => (res.ok ? res.json() : Promise.reject(res.status))),
        fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=4&lang=fr`,
        ).then((res) => (res.ok ? res.json() : Promise.reject(res.status))),
      ]);

      const next: Suggestion[] = [];
      if (adresse.status === "fulfilled") {
        for (const f of adresse.value.features ?? []) {
          next.push({
            label: f.properties.label,
            lon: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          });
        }
      }
      if (photon.status === "fulfilled") {
        for (const f of photon.value.features ?? []) {
          const p = f.properties ?? {};
          // La France est déjà couverte (et mieux) par l'API adresse.
          if (!p.countrycode || p.countrycode === "FR") continue;
          const label = [
            [p.name ?? [p.housenumber, p.street].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(" "),
            [p.postcode, p.city ?? p.district].filter(Boolean).join(" "),
            p.country,
          ]
            .filter(Boolean)
            .join(", ");
          if (!label) continue;
          next.push({
            label,
            lon: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          });
        }
      }
      if (adresse.status === "rejected" && photon.status === "rejected") {
        setError("Recherche d'adresse indisponible pour le moment.");
        return;
      }

      // Doublons grossiers (même point à ~100 m près).
      const seen = new Set<string>();
      const unique = next.filter((s) => {
        const key = `${s.lat.toFixed(3)}:${s.lon.toFixed(3)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setSuggestions(unique.slice(0, 6));
      setOpen(unique.length > 0);
    }, 300);
  };

  const pick = (s: Suggestion) => {
    onChange({ lat: s.lat, lon: s.lon, label: s.label });
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: "Ma position",
        });
      },
      () => {
        setLocating(false);
        setError(
          "Position refusée ou indisponible — cherchez une adresse à la place.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length > 0) pick(suggestions[0]);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder={value ? value.label : "Adresse, ville, code postal…"}
            className="w-full rounded-xl border border-fuchsia-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-200"
            aria-label="Rechercher une adresse"
          />
          {open && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-fuchsia-200 bg-white shadow-lg">
              {suggestions.map((s) => (
                <li key={`${s.lat}:${s.lon}`}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-fuchsia-50"
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
        >
          {locating ? "Localisation…" : "📍 Autour de moi"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
