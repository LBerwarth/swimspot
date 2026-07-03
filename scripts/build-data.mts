/**
 * Génère `public/data/piscines.json` : la liste des piscines de France.
 *
 * Deux sources ouvertes, fusionnées :
 *  1. Data ES (ministère des Sports, licence ouverte) — recensement officiel
 *     des bassins de natation : la base de référence (noms, adresses, GPS).
 *  2. OpenStreetMap (ODbL) — enrichissement quand un équipement OSM se trouve
 *     à moins de 300 m : horaires, tarif, site web, téléphone.
 *
 * Usage :
 *   npm run build:data                          # télécharge les deux sources
 *   npm run build:data -- --dataes f.json --osm o.json   # fichiers locaux
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_ES_URL =
  "https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es/exports/json" +
  "?where=" + encodeURIComponent('equip_type_famille="Bassin de natation"') +
  "&select=" + encodeURIComponent(
    "inst_numero,inst_nom,inst_adresse,inst_cp,new_name,dep_code_filled," +
    "equip_numero,equip_nom,equip_type_name,equip_coordonnees,equip_nature,equip_ouv_public_bool," +
    "equip_bassin_long,equip_long",
  );

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_QUERY = `
[out:json][timeout:300];
area["ISO3166-1"="FR"][admin_level=2]->.fr;
(
  nwr["leisure"="sports_centre"]["sport"~"swimming"](area.fr);
  nwr["leisure"="water_park"](area.fr);
  nwr["leisure"="swimming_pool"]["access"~"^(yes|public|customers)$"]["name"](area.fr);
);
out tags center;
`;

interface DataEsRow {
  inst_numero: string;
  inst_nom: string | null;
  inst_adresse: string | null;
  inst_cp: string | null;
  new_name: string | null;
  dep_code_filled: string | null;
  equip_nom: string | null;
  equip_type_name: string | null;
  equip_coordonnees: { lon: number; lat: number } | null;
  equip_nature: string | null;
  equip_ouv_public_bool: string | null;
  equip_bassin_long: number | null;
  equip_long: number | null;
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const BASIN_LABELS: Record<string, string> = {
  "Bassin sportif de natation": "sportif",
  "Bassin ludique de natation": "ludique",
  "Bassin mixte de natation": "mixte",
  "Bassin de réception de toboggan": "toboggan",
  "Fosse à plongeon": "plongeon",
  "Fosse à plongée": "plongée",
};

/**
 * Installations à écarter d'après leur nom : établissements scolaires,
 * militaires, médicaux, hébergements touristiques, clubs privés…
 * Le drapeau Data ES `equip_ouv_public_bool` est trop peu fiable pour servir
 * de filtre : il exclut des piscines municipales avérées (Chapou ou
 * Léo Lagrange à Toulouse) tout en gardant des lycées.
 */
const RESTRICTED_NAME_RE = new RegExp(
  [
    "lycee", "college", "\\becole\\b", "scolaire", "universit", "\\biut\\b", "insa",
    "supaero", "campus", "crous", "internat",
    "caserne", "gendarmerie", "militaire", "armee", "regiment", "base aerienne",
    "marine nationale", "centre d.instruction",
    "hopital", "hospitalier", "clinique", "ehpad", "medico", "penitentiaire",
    "maison d.arret",
    "camping", "\\bhotel\\b", "village.?vacances", "centre de vacances", "\\bvvf\\b",
    "club med", "residence", "thalasso",
    "centre de formation", "creps", "institut", "mfr", "maison familiale",
    "aerodrome", "\\bgolf\\b", "tennis", "squash", "prive",
  ].join("|"),
);

/**
 * Installations Data ES qui regroupent en réalité plusieurs piscines
 * distinctes : on les scinde d'après le nom des équipements. Chaque bassin
 * rejoint le premier groupe dont le motif correspond (sinon le premier
 * groupe). Les coordonnées propres à chaque groupe sont recalculées.
 */
const SPLIT_OVERRIDES: Record<
  string,
  Array<{ suffix: string; name: string; match: RegExp }>
> = {
  // « Parc des Sports », île du Ramier à Toulouse = Castex + Alfred Nakache.
  I315550226: [
    { suffix: "castex", name: "Piscine Castex", match: /castex/i },
    { suffix: "nakache", name: "Piscine Alfred Nakache", match: /nakache/i },
  ],
};

/**
 * Longueurs de bassin vérifiées manuellement, absentes des sources ouvertes
 * (bassins trop récents pour le recensement, non cartographiés dans OSM).
 * Source à documenter dans le commentaire de chaque entrée.
 */
const EXTRA_LENGTHS: Record<string, number[]> = {
  // Toulouse-Lautrec : bassin nordique extérieur « Gisèle Vallerey » de 50 m,
  // ouvert le 18 mai 2026 — metropole.toulouse.fr/annuaire/piscine-toulouse-lautrec.
  I315550230: [50],
};

/** Minuscules sans accents, pour comparer les noms au motif d'exclusion. */
function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const LOWERCASE_WORDS = new Set([
  "de", "du", "des", "la", "le", "les", "l", "d", "et", "au", "aux", "en", "sur", "sous", "à",
]);

/** « PISCINE DE LA GARONNE » → « Piscine de la Garonne ». */
function titleCaseFR(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\p{L}]+/gu, (word, offset) =>
      offset > 0 && LOWERCASE_WORDS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .replace(/\s+/g, " ")
    .trim();
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

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadDataEs(): Promise<DataEsRow[]> {
  const local = getArg("dataes");
  if (local) return JSON.parse(readFileSync(local, "utf-8"));
  console.log("Téléchargement Data ES…");
  const res = await fetch(DATA_ES_URL);
  if (!res.ok) throw new Error(`Data ES : HTTP ${res.status}`);
  return res.json() as Promise<DataEsRow[]>;
}

async function loadOsm(): Promise<OsmElement[]> {
  const local = getArg("osm");
  const raw = local
    ? JSON.parse(readFileSync(local, "utf-8"))
    : await (async () => {
        console.log("Téléchargement OpenStreetMap (Overpass, ~1 min)…");
        const res = await fetch(OVERPASS_URL, { method: "POST", body: OVERPASS_QUERY });
        if (!res.ok) throw new Error(`Overpass : HTTP ${res.status}`);
        return res.json();
      })();
  return raw.elements as OsmElement[];
}

function osmCoords(el: OsmElement): { lat: number; lon: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lon: el.lon };
  return el.center ?? null;
}

/** Index spatial simple : cellules d'environ 1 km de côté. */
function gridKey(lat: number, lon: number): string {
  return `${Math.round(lat * 100)}:${Math.round(lon * 100)}`;
}

async function main() {
  const [rows, osmElements] = await Promise.all([loadDataEs(), loadOsm()]);
  console.log(`Data ES : ${rows.length} bassins — OSM : ${osmElements.length} équipements`);

  // 1. Regrouper les bassins Data ES par installation (= une piscine).
  const byInst = new Map<string, DataEsRow[]>();
  for (const row of rows) {
    if (!row.equip_coordonnees) continue;
    const list = byInst.get(row.inst_numero) ?? [];
    list.push(row);
    byInst.set(row.inst_numero, list);
  }

  // 1 bis. Scinder les installations qui regroupent plusieurs piscines.
  const forcedNames = new Map<string, string>();
  for (const [inst, groups] of Object.entries(SPLIT_OVERRIDES)) {
    const basins = byInst.get(inst);
    if (!basins) continue;
    byInst.delete(inst);
    for (const group of groups) {
      const members = basins.filter((b, i) => {
        const name = `${b.equip_nom ?? ""} ${b.inst_nom ?? ""}`;
        const first = groups.find((g) => g.match.test(name)) ?? groups[0];
        void i;
        return first === group;
      });
      if (members.length === 0) continue;
      const id = `${inst}-${group.suffix}`;
      byInst.set(id, members);
      forcedNames.set(id, group.name);
    }
  }

  // 2. Index spatial des équipements OSM.
  const osmGrid = new Map<string, OsmElement[]>();
  for (const el of osmElements) {
    const c = osmCoords(el);
    if (!c || !el.tags) continue;
    const key = gridKey(c.lat, c.lon);
    const list = osmGrid.get(key) ?? [];
    list.push(el);
    osmGrid.set(key, list);
  }

  // Tous les équipements OSM à moins de 300 m, du plus proche au plus loin.
  // Un même site est souvent décrit par plusieurs éléments (chaque bassin +
  // le centre sportif) : les horaires vivent sur un bassin, le site web sur
  // le centre — il faut fusionner, pas prendre le seul plus proche.
  const nearbyOsm = (lat: number, lon: number): OsmElement[] => {
    const found: Array<{ el: OsmElement; dist: number }> = [];
    const cy = Math.round(lat * 100);
    const cx = Math.round(lon * 100);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const el of osmGrid.get(`${cy + dy}:${cx + dx}`) ?? []) {
          const c = osmCoords(el)!;
          const dist = haversineKm(lat, lon, c.lat, c.lon);
          if (dist < 0.3) found.push({ el, dist });
        }
      }
    }
    return found.sort((a, b) => a.dist - b.dist).map((f) => f.el);
  };

  // 3. Construire les piscines.
  const pools = [];
  let skippedPrivate = 0;
  const stats = { matched: 0, hours: 0, charge: 0, fee: 0, website: 0 };

  for (const [inst, basins] of byInst) {
    const namesToCheck = [basins[0].inst_nom, ...basins.map((b) => b.equip_nom)]
      .filter((n): n is string => !!n)
      .map(normalizeName)
      .join(" ");
    if (RESTRICTED_NAME_RE.test(namesToCheck)) {
      skippedPrivate++;
      continue;
    }

    const lat = basins.reduce((s, b) => s + b.equip_coordonnees!.lat, 0) / basins.length;
    const lon = basins.reduce((s, b) => s + b.equip_coordonnees!.lon, 0) / basins.length;

    const rawName =
      forcedNames.get(inst) ??
      [basins[0].inst_nom, ...basins.map((b) => b.equip_nom)]
        .filter((n): n is string => !!n)
        .find((n) => /piscine|aqua|nautique|baignade|natation|baln/i.test(n)) ??
      basins[0].inst_nom ??
      basins[0].equip_nom ??
      "Piscine";

    const basinLabels = [
      ...new Set(
        basins
          .map((b) => BASIN_LABELS[b.equip_type_name ?? ""] )
          .filter((l): l is string => !!l),
      ),
    ];

    const natures = new Set(
      basins
        .map((b) => b.equip_nature ?? "")
        .map((n) =>
          n.includes("Intérieur") ? "int"
          : n.includes("Découvrable") ? "mix"
          : n.includes("Découvert") || n.includes("Extérieur") ? "ext"
          : null,
        )
        .filter(Boolean),
    );
    const env =
      natures.has("mix") || (natures.has("int") && natures.has("ext"))
        ? "mix"
        : natures.has("int")
          ? "int"
          : natures.has("ext")
            ? "ext"
            : undefined;

    const lens = [
      ...new Set(
        basins
          .map((b) => b.equip_bassin_long ?? b.equip_long)
          .filter((v): v is number => typeof v === "number" && v > 0)
          .map((v) => Math.round(v * 10) / 10)
          .concat(EXTRA_LENGTHS[inst] ?? []),
      ),
    ].sort((a, b) => b - a);

    const candidates = nearbyOsm(lat, lon);
    // Valeur du plus proche élément qui renseigne l'un des tags demandés.
    const pick = (...keys: string[]): string | undefined => {
      for (const el of candidates) {
        for (const key of keys) {
          const value = el.tags?.[key];
          if (value) return value;
        }
      }
      return undefined;
    };
    const tags = {
      opening_hours: pick("opening_hours"),
      fee: pick("fee"),
      charge: pick("charge"),
      website: pick("website", "contact:website"),
      phone: pick("phone", "contact:phone"),
    };
    if (candidates.length > 0) stats.matched++;
    if (tags.opening_hours) stats.hours++;
    if (tags.charge) stats.charge++;
    if (tags.fee) stats.fee++;
    if (tags.website) stats.website++;

    pools.push({
      id: inst,
      name: titleCaseFR(rawName),
      city: basins[0].new_name ?? "",
      cp: basins[0].inst_cp ?? "",
      ...(basins[0].inst_adresse ? { address: basins[0].inst_adresse } : {}),
      dep: basins[0].dep_code_filled ?? "",
      country: "FR",
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      ...(env ? { env } : {}),
      ...(lens.length ? { lens } : {}),
      basins: basinLabels,
      ...(tags.opening_hours ? { hours: tags.opening_hours } : {}),
      ...(tags.fee === "yes" ? { fee: true } : tags.fee === "no" ? { fee: false } : {}),
      ...(tags.charge ? { charge: tags.charge } : {}),
      ...(tags.website ? { website: tags.website } : {}),
      ...(tags.phone ? { phone: tags.phone } : {}),
    });
  }

  pools.sort((a, b) => a.id.localeCompare(b.id));

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "piscines.json");
  const payload = { updated: new Date().toISOString(), count: pools.length, pools };
  writeFileSync(outFile, JSON.stringify(payload));

  console.log(`✔ ${pools.length} piscines écrites dans ${outFile}`);
  console.log(`  (${skippedPrivate} installations restreintes écartées d'après leur nom)`);
  console.log(
    `  Correspondances OSM : ${stats.matched} — horaires : ${stats.hours}, ` +
    `tarif : ${stats.charge}, payant/gratuit : ${stats.fee}, site web : ${stats.website}`,
  );
  const size = JSON.stringify(payload).length;
  console.log(`  Taille : ${(size / 1024 / 1024).toFixed(2)} Mo`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
