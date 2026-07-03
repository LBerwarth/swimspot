import type { PoolWithDistance } from "@/lib/types";

/**
 * Distances par la route via l'API table du serveur OSRM public (démo).
 * Une seule requête par recherche : origine → toutes les piscines du rayon.
 * En cas d'échec (serveur démo, hors ligne…), l'appelant retombe sur la
 * distance à vol d'oiseau.
 */
const OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/driving";

/** Borne le nombre de destinations : longueur d'URL et fair use du serveur démo. */
export const MAX_STREET_DESTINATIONS = 80;

/** Distances par la route en km depuis `origin`, indexées par id de piscine. */
export async function fetchStreetDistancesKm(
  origin: { lat: number; lon: number },
  pools: PoolWithDistance[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const targets = pools.slice(0, MAX_STREET_DESTINATIONS);
  if (targets.length === 0) return result;

  const coords = [
    `${origin.lon},${origin.lat}`,
    ...targets.map((p) => `${p.lon},${p.lat}`),
  ].join(";");
  const res = await fetch(
    `${OSRM_TABLE_URL}/${coords}?sources=0&annotations=distance`,
    { signal },
  );
  if (!res.ok) throw new Error(`OSRM : HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== "Ok" || !Array.isArray(data.distances?.[0])) {
    throw new Error("OSRM : réponse invalide");
  }

  const row: Array<number | null> = data.distances[0];
  targets.forEach((pool, i) => {
    const meters = row[i + 1];
    if (typeof meters === "number") result.set(pool.id, meters / 1000);
  });
  return result;
}
