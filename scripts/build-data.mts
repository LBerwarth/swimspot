/**
 * Génère les jeux de données par pays : `public/data/piscines-<cc>.json`
 * et l'index `public/data/index.json` (pays, comptes, emprises).
 *
 * Motif commun à tous les pays : une source officielle nationale fournit la
 * base (voir scripts/sources/*), OpenStreetMap (ODbL) enrichit chaque piscine
 * située à moins de 300 m d'un équipement OSM : horaires, tarif, site web,
 * téléphone.
 *
 * Usage :
 *   npm run build:data                       # tous les pays
 *   npm run build:data -- --country fr      # un seul pays
 *   npm run build:data -- --dataes f.json --osm-fr o.json   # fichiers locaux
 *   (--osm est un alias historique de --osm-fr)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "../lib/types";
import { loadFrance } from "./sources/fr.mts";
import { loadEngland } from "./sources/gb.mts";
import { loadGermany } from "./sources/de.mts";

// Serveur principal puis miroir : le principal limite parfois par IP.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const SOURCES: Record<string, { iso: string; load: () => Promise<Pool[]> }> = {
  fr: { iso: "FR", load: () => loadFrance(getArg("dataes")) },
  gb: { iso: "GB", load: loadEngland },
  de: { iso: "DE", load: () => loadGermany(getArg("baederleben")) },
};

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function overpassQuery(iso: string): string {
  return `
[out:json][timeout:300];
area["ISO3166-1"="${iso}"][admin_level=2]->.c;
(
  nwr["leisure"="sports_centre"]["sport"~"swimming"](area.c);
  nwr["leisure"="water_park"](area.c);
  nwr["leisure"="swimming_pool"]["access"~"^(yes|public|customers)$"]["name"](area.c);
);
out tags center;
`;
}

const OSM_CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

async function loadOsm(iso: string, localFile?: string): Promise<OsmElement[]> {
  if (localFile) {
    return (JSON.parse(readFileSync(localFile, "utf-8")) as { elements: OsmElement[] })
      .elements;
  }
  // Cache local (non commité) : les serveurs Overpass limitent par IP, un
  // téléchargement réussi ne doit jamais être perdu.
  const cacheFile = join(
    dirname(fileURLToPath(import.meta.url)),
    "cache",
    `osm-${iso.toLowerCase()}.json`,
  );
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf-8"));
    if (Date.now() - new Date(cached.fetched).getTime() < OSM_CACHE_TTL_MS) {
      console.log(`OpenStreetMap ${iso} : cache local du ${cached.fetched}`);
      return cached.elements as OsmElement[];
    }
  }
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    console.log(`Téléchargement OpenStreetMap ${iso} (${new URL(url).host}, ~1 min)…`);
    try {
      const res = await fetch(url, { method: "POST", body: overpassQuery(iso) });
      if (!res.ok) throw new Error(`Overpass ${iso} : HTTP ${res.status}`);
      const raw = await res.json();
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(
        cacheFile,
        JSON.stringify({ fetched: new Date().toISOString(), elements: raw.elements }),
      );
      return raw.elements as OsmElement[];
    } catch (err) {
      lastError = err;
      console.warn(`  échec, essai du serveur suivant… (${err})`);
    }
  }
  throw lastError;
}

function osmCoords(el: OsmElement): { lat: number; lon: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lon: el.lon };
  return el.center ?? null;
}

/** Index spatial simple : cellules d'environ 1 km de côté. */
function gridKey(lat: number, lon: number): string {
  return `${Math.round(lat * 100)}:${Math.round(lon * 100)}`;
}

/**
 * Enrichit les piscines avec les tags OSM des équipements à moins de 300 m.
 * Un même site est souvent décrit par plusieurs éléments (chaque bassin +
 * le centre sportif) : les horaires vivent sur un bassin, le site web sur
 * le centre — on fusionne tous les éléments proches, valeur du plus proche
 * par champ.
 */
function enrichWithOsm(pools: Pool[], elements: OsmElement[]) {
  const grid = new Map<string, OsmElement[]>();
  for (const el of elements) {
    const c = osmCoords(el);
    if (!c || !el.tags) continue;
    const key = gridKey(c.lat, c.lon);
    const list = grid.get(key) ?? [];
    list.push(el);
    grid.set(key, list);
  }

  const stats = { matched: 0, hours: 0, charge: 0, fee: 0, website: 0 };

  for (const pool of pools) {
    const found: Array<{ el: OsmElement; dist: number }> = [];
    const cy = Math.round(pool.lat * 100);
    const cx = Math.round(pool.lon * 100);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const el of grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
          const c = osmCoords(el)!;
          const dist = haversineKm(pool.lat, pool.lon, c.lat, c.lon);
          if (dist < 0.3) found.push({ el, dist });
        }
      }
    }
    const candidates = found.sort((a, b) => a.dist - b.dist).map((f) => f.el);
    if (candidates.length === 0) continue;
    stats.matched++;

    const pick = (...keys: string[]): string | undefined => {
      for (const el of candidates) {
        for (const key of keys) {
          const value = el.tags?.[key];
          if (value) return value;
        }
      }
      return undefined;
    };

    const hours = pick("opening_hours");
    const fee = pick("fee");
    const charge = pick("charge");
    const website = pool.website ?? pick("website", "contact:website");
    const phone = pick("phone", "contact:phone");

    if (hours) {
      pool.hours = hours;
      stats.hours++;
    }
    if (fee === "yes") pool.fee = true;
    else if (fee === "no") pool.fee = false;
    if (fee) stats.fee++;
    if (charge) {
      pool.charge = charge;
      stats.charge++;
    }
    if (website) {
      pool.website = website;
      stats.website++;
    }
    if (phone) pool.phone = phone;
  }

  console.log(
    `  Correspondances OSM : ${stats.matched} — horaires : ${stats.hours}, ` +
    `tarif : ${stats.charge}, payant/gratuit : ${stats.fee}, site web : ${stats.website}`,
  );
}

interface IndexEntry {
  code: string;
  count: number;
  /** [minLat, minLon, maxLat, maxLon] */
  bbox: [number, number, number, number];
  updated: string;
}

async function main() {
  const targets = (getArg("country") ?? Object.keys(SOURCES).join(","))
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  for (const cc of targets) {
    if (!SOURCES[cc]) throw new Error(`Pays inconnu : ${cc} (connus : ${Object.keys(SOURCES).join(", ")})`);
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
  mkdirSync(outDir, { recursive: true });
  const indexFile = join(outDir, "index.json");

  // Les pays non reconstruits gardent leur entrée d'index.
  const entries = new Map<string, IndexEntry>();
  if (existsSync(indexFile)) {
    const existing = JSON.parse(readFileSync(indexFile, "utf-8"));
    for (const e of existing.countries ?? []) entries.set(e.code, e);
  }

  for (const cc of targets) {
    const { iso, load } = SOURCES[cc];
    console.log(`\n=== ${iso} ===`);
    const pools = await load();
    // --skip-osm : publier sans enrichissement (utile quand les serveurs
    // Overpass limitent) ; relancer sans le drapeau pour enrichir.
    if (process.argv.includes("--skip-osm")) {
      console.log("  Enrichissement OSM sauté (--skip-osm).");
    } else {
      const osm = await loadOsm(iso, getArg(`osm-${cc}`) ?? (cc === "fr" ? getArg("osm") : undefined));
      enrichWithOsm(pools, osm);
    }
    pools.sort((a, b) => a.id.localeCompare(b.id));

    const updated = new Date().toISOString();
    const payload = { updated, country: iso, count: pools.length, pools };
    const outFile = join(outDir, `piscines-${cc}.json`);
    writeFileSync(outFile, JSON.stringify(payload));
    console.log(
      `✔ ${pools.length} piscines → ${outFile} (${(JSON.stringify(payload).length / 1024 / 1024).toFixed(2)} Mo)`,
    );

    const bbox: [number, number, number, number] = [
      Math.min(...pools.map((p) => p.lat)),
      Math.min(...pools.map((p) => p.lon)),
      Math.max(...pools.map((p) => p.lat)),
      Math.max(...pools.map((p) => p.lon)),
    ];
    entries.set(cc, { code: cc, count: pools.length, bbox, updated });
  }

  const index = {
    updated: new Date().toISOString(),
    countries: [...entries.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
  writeFileSync(indexFile, JSON.stringify(index));
  console.log(`\n✔ Index : ${index.countries.map((c) => `${c.code}=${c.count}`).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
