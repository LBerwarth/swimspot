/**
 * Enrichissement « horaires du centre » depuis les sites officiels.
 *
 * Beaucoup de sites d'exploitants (Everyone Active, Places Leisure,
 * Parkwood…) embarquent des données structurées schema.org avec
 * `openingHoursSpecification` : on les lit (pas de scraping HTML fragile),
 * on les convertit au format OSM `opening_hours` — validé par notre propre
 * parseur avant d'être retenu — et on complète les piscines SANS horaires
 * dans `public/data/piscines-<cc>.json` (champ `hoursFrom: "web"`).
 *
 * Le cache `scripts/cache/website-hours.json` (commité) évite de re-visiter
 * les sites : sans `--refresh`, une entrée de moins de 30 jours est réutilisée.
 *
 * Usage :
 *   npm run scrape:hours                    # tous les pays présents
 *   npm run scrape:hours -- --country gb    # un pays
 *   npm run scrape:hours -- --refresh       # ignore le cache
 *   npm run scrape:hours -- --limit 50      # essai borné
 *
 * NB : après un `npm run build:data`, relancer ce script (rapide grâce au
 * cache) pour réappliquer les horaires web.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolDataset } from "../lib/types";
import { parseOpeningHours } from "../lib/opening-hours";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data");
const CACHE_FILE = join(ROOT, "scripts", "cache", "website-hours.json");
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 12000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Swimspot-data";

interface CacheEntry {
  hours: string | null;
  fetched: string;
}

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DAY_MAP: Record<string, string> = {
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
  sunday: "Su",
};
const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Cherche récursivement les tableaux `openingHoursSpecification`. */
function findSpecs(node: unknown, out: unknown[]): void {
  if (Array.isArray(node)) {
    for (const item of node) findSpecs(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (record.openingHoursSpecification) {
    const spec = record.openingHoursSpecification;
    out.push(...(Array.isArray(spec) ? spec : [spec]));
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") findSpecs(value, out);
  }
}

/** Convertit une openingHoursSpecification schema.org en chaîne OSM. */
function specsToOsm(specs: unknown[]): string | null {
  const perDay = new Map<string, string[]>();
  for (const raw of specs) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    // Les périodes bornées (saisonnières) sont hors périmètre : trop risqué
    // de les résumer à une semaine type.
    if (e.validFrom || e.validThrough) continue;
    const opens = normalizeTime(e.opens);
    const closes = normalizeTime(e.closes);
    if (!opens || !closes || opens === closes) continue;
    const days = Array.isArray(e.dayOfWeek) ? e.dayOfWeek : [e.dayOfWeek];
    for (const day of days) {
      const key = DAY_MAP[String(day).toLowerCase().replace(/.*\//, "")];
      if (!key) continue;
      const list = perDay.get(key) ?? [];
      list.push(`${opens}-${closes}`);
      perDay.set(key, list);
    }
  }
  if (perDay.size === 0) return null;

  // Jours consécutifs identiques regroupés : « Mo-Fr 06:30-22:00; Sa 08:00-18:00 ».
  const dayRanges = DAY_ORDER.map((d) =>
    (perDay.get(d) ?? []).sort().join(","),
  );
  const rules: string[] = [];
  let start = 0;
  while (start < 7) {
    let end = start;
    while (end + 1 < 7 && dayRanges[end + 1] === dayRanges[start]) end++;
    if (dayRanges[start]) {
      const days =
        start === end
          ? DAY_ORDER[start]
          : `${DAY_ORDER[start]}-${DAY_ORDER[end]}`;
      rules.push(`${days} ${dayRanges[start]}`);
    }
    start = end + 1;
  }
  if (rules.length === 0) return null;
  const osm = rules.join("; ");
  // Garde-fou qualité : la chaîne doit être comprise par notre parseur.
  return parseOpeningHours(osm) ? osm : null;
}

async function fetchHours(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const specs: unknown[] = [];
    for (const m of html.matchAll(
      /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        findSpecs(JSON.parse(m[1]), specs);
      } catch {
        // JSON-LD invalide : on ignore ce bloc.
      }
    }
    return specs.length ? specsToOsm(specs) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const limit = Number(getArg("limit") ?? Infinity);
  const countriesArg = getArg("country");
  const files = readdirSync(DATA_DIR)
    .filter((f) => /^piscines-[a-z]{2}\.json$/.test(f))
    .filter(
      (f) =>
        !countriesArg ||
        countriesArg.split(",").some((c) => f === `piscines-${c.trim()}.json`),
    );

  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  const cache: Record<string, CacheEntry> = existsSync(CACHE_FILE)
    ? JSON.parse(readFileSync(CACHE_FILE, "utf-8"))
    : {};

  for (const file of files) {
    const path = join(DATA_DIR, file);
    const dataset: PoolDataset = JSON.parse(readFileSync(path, "utf-8"));
    const targets = dataset.pools.filter(
      (p) => p.website && !p.hours && /^https?:\/\//i.test(p.website),
    );
    console.log(`${file} : ${targets.length} piscines avec site web sans horaires`);

    let fetched = 0;
    let applied = 0;
    let index = 0;
    const queue = targets.slice(0, Number.isFinite(limit) ? limit : undefined);

    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (index < queue.length) {
        const pool: Pool = queue[index++];
        const url = pool.website!;
        const entry = cache[url];
        const fresh =
          entry && Date.now() - new Date(entry.fetched).getTime() < CACHE_TTL_MS;
        let hours: string | null;
        if (!refresh && fresh) {
          hours = entry.hours;
        } else {
          hours = await fetchHours(url);
          cache[url] = { hours, fetched: new Date().toISOString() };
          fetched++;
          // Politesse : petit délai entre requêtes de chaque worker.
          await new Promise((r) => setTimeout(r, 300));
        }
        if (hours) {
          pool.hours = hours;
          pool.hoursFrom = "web";
          applied++;
        }
      }
    });
    await Promise.all(workers);

    writeFileSync(path, JSON.stringify(dataset));
    console.log(
      `  → ${applied} horaires appliqués (${fetched} sites visités, le reste en cache)`,
    );
  }

  writeFileSync(CACHE_FILE, JSON.stringify(cache));
  console.log(`Cache : ${Object.keys(cache).length} URL connues → ${CACHE_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
