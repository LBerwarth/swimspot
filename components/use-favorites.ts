"use client";

import { useSyncExternalStore } from "react";

/**
 * Piscines favorites, partagées entre les cartes (étoile) et le filtre.
 * localStorage + useSyncExternalStore : sûr à l'hydratation (le serveur voit
 * une liste vide), synchro immédiate entre composants, et entre onglets via
 * l'événement `storage`.
 */
const KEY = "pf:favorites";
const EMPTY: string[] = [];

const listeners = new Set<() => void>();
// getSnapshot doit renvoyer une référence stable tant que rien ne change.
let cache: { raw: string | null; ids: string[] } = { raw: null, ids: EMPTY };

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cache.raw) {
      const parsed = JSON.parse(raw ?? "[]");
      cache = { raw, ids: Array.isArray(parsed) ? parsed : EMPTY };
    }
  } catch {
    // Stockage indisponible : on garde le dernier état connu.
  }
  return cache.ids;
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFavorites(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function toggleFavorite(id: string) {
  const ids = read();
  const next = ids.includes(id)
    ? ids.filter((x) => x !== id)
    : [...ids, id];
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // Quota ou navigation privée : le favori vivra le temps de la page.
  }
  cache = { raw, ids: next };
  emit();
}
