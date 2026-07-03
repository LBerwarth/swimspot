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
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const next: Suggestion[] = (data.features ?? []).map(
          (f: {
            properties: { label: string };
            geometry: { coordinates: [number, number] };
          }) => ({
            label: f.properties.label,
            lon: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          }),
        );
        setSuggestions(next);
        setOpen(next.length > 0);
      } catch {
        setError("Recherche d'adresse indisponible pour le moment.");
      }
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
            className="w-full rounded-xl border border-sky-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-sky-900/40 focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
            aria-label="Rechercher une adresse"
          />
          {open && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-sky-200 bg-white shadow-lg">
              {suggestions.map((s) => (
                <li key={`${s.lat}:${s.lon}`}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-sky-50"
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
          className="shrink-0 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
        >
          {locating ? "Localisation…" : "📍 Autour de moi"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
