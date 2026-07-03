/**
 * Superposition « statut en direct » pour les piscines de Toulouse.
 *
 * L'application sœur toulouse-piscines analyse le site de la métropole toutes
 * les ~30 min (fermetures estivales et exceptionnelles comprises) et expose
 * /api/status. Quand une piscine d'ici correspond à une piscine de là-bas,
 * son vrai statut du jour prime sur les horaires OSM.
 */

const STATUS_URL =
  process.env.NEXT_PUBLIC_TOULOUSE_STATUS_URL ??
  "https://toulouse-piscines.vercel.app/api/status";

/** id Data ES (piscines.json) → slugs toulouse-piscines correspondants. */
const SLUGS_BY_POOL_ID: Record<string, string[]> = {
  I315550015: ["piscine-jean-boiteux-espace-job"],
  I315550075: ["piscine-alex-jany"],
  I315550154: ["piscine-yvonne-godard"],
  I315550223: ["piscine-alban-minville"],
  I315550224: ["piscine-bellevue"],
  "I315550226-castex": ["piscine-castex"],
  // Nakache été (150 m extérieur) et hiver (25 m intérieur) = un seul site ici.
  "I315550226-nakache": [
    "piscine-alfred-nakache-ete",
    "piscine-alfred-nakache-hiver",
  ],
  I315550227: ["piscine-leo-lagrange"],
  I315550229: ["piscine-chapou-ete"],
  I315550230: ["piscine-toulouse-lautrec"],
  I315550232: ["piscine-papus"],
};

interface ApiPool {
  slug: string;
  name: string;
  url: string;
  ok: boolean;
  openToday: boolean | null;
  slots: Array<{ start: string; end: string }>;
  closureReason: string | null;
}

export interface LivePoolStatus {
  openToday: boolean;
  /** Créneaux du jour, heures « HH:MM ». */
  slots: Array<{ start: string; end: string }>;
  closureReason: string | null;
  url: string;
  updatedAt: string;
}

/** Statuts live indexés par id de piscine (piscines.json). */
export async function fetchToulouseLive(
  signal?: AbortSignal,
): Promise<Map<string, LivePoolStatus>> {
  const res = await fetch(STATUS_URL, { signal });
  if (!res.ok) throw new Error(`toulouse-piscines : HTTP ${res.status}`);
  const data: { updatedAt: string; pools: ApiPool[] } = await res.json();

  const bySlug = new Map(
    data.pools
      .filter((p) => p.ok && p.openToday !== null)
      .map((p) => [p.slug, p]),
  );

  const result = new Map<string, LivePoolStatus>();
  for (const [poolId, slugs] of Object.entries(SLUGS_BY_POOL_ID)) {
    const entries = slugs
      .map((slug) => bySlug.get(slug))
      .filter((p): p is ApiPool => !!p);
    if (entries.length === 0) continue;
    const openToday = entries.some((p) => p.openToday);
    result.set(poolId, {
      openToday,
      slots: entries.flatMap((p) => p.slots),
      closureReason: openToday
        ? null
        : (entries.map((p) => p.closureReason).find(Boolean) ?? null),
      url: entries[0].url,
      updatedAt: data.updatedAt,
    });
  }
  return result;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Ouverte à l'instant `now` d'après les créneaux live du jour. */
export function isOpenNowLive(status: LivePoolStatus, now: Date): boolean {
  if (!status.openToday) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return status.slots.some(
    ({ start, end }) => minutes >= toMinutes(start) && minutes < toMinutes(end),
  );
}

/** « 12:00 » → « 12h », « 09:30 » → « 9h30 ». */
export function formatSlotTime(time: string): string {
  const [h, m] = time.split(":");
  return m === "00" ? `${+h}h` : `${+h}h${m}`;
}
