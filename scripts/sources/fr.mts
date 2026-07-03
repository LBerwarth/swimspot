/**
 * Source France : Data ES (ministère des Sports, licence ouverte) —
 * recensement officiel des bassins de natation, agrégé par installation.
 */
import { readFileSync } from "node:fs";
import type { Pool } from "../../lib/types";

const DATA_ES_URL =
  "https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es/exports/json" +
  "?where=" + encodeURIComponent('equip_type_famille="Bassin de natation"') +
  "&select=" + encodeURIComponent(
    "inst_numero,inst_nom,inst_adresse,inst_cp,new_name,dep_code_filled," +
    "equip_numero,equip_nom,equip_type_name,equip_coordonnees,equip_nature,equip_ouv_public_bool," +
    "equip_bassin_long,equip_long",
  );

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

export async function loadFrance(localFile?: string): Promise<Pool[]> {
  let rows: DataEsRow[];
  if (localFile) {
    rows = JSON.parse(readFileSync(localFile, "utf-8"));
  } else {
    console.log("Téléchargement Data ES…");
    const res = await fetch(DATA_ES_URL);
    if (!res.ok) throw new Error(`Data ES : HTTP ${res.status}`);
    rows = (await res.json()) as DataEsRow[];
  }
  console.log(`Data ES : ${rows.length} bassins`);

  // Regrouper les bassins par installation (= une piscine).
  const byInst = new Map<string, DataEsRow[]>();
  for (const row of rows) {
    if (!row.equip_coordonnees) continue;
    const list = byInst.get(row.inst_numero) ?? [];
    list.push(row);
    byInst.set(row.inst_numero, list);
  }

  // Scinder les installations qui regroupent plusieurs piscines.
  const forcedNames = new Map<string, string>();
  for (const [inst, groups] of Object.entries(SPLIT_OVERRIDES)) {
    const basins = byInst.get(inst);
    if (!basins) continue;
    byInst.delete(inst);
    for (const group of groups) {
      const members = basins.filter((b) => {
        const name = `${b.equip_nom ?? ""} ${b.inst_nom ?? ""}`;
        const first = groups.find((g) => g.match.test(name)) ?? groups[0];
        return first === group;
      });
      if (members.length === 0) continue;
      const id = `${inst}-${group.suffix}`;
      byInst.set(id, members);
      forcedNames.set(id, group.name);
    }
  }

  const pools: Pool[] = [];
  let skippedRestricted = 0;

  for (const [inst, basins] of byInst) {
    const namesToCheck = [basins[0].inst_nom, ...basins.map((b) => b.equip_nom)]
      .filter((n): n is string => !!n)
      .map(normalizeName)
      .join(" ");
    if (RESTRICTED_NAME_RE.test(namesToCheck)) {
      skippedRestricted++;
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
          .map((b) => BASIN_LABELS[b.equip_type_name ?? ""])
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
        ? ("mix" as const)
        : natures.has("int")
          ? ("int" as const)
          : natures.has("ext")
            ? ("ext" as const)
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
    });
  }

  console.log(
    `France : ${pools.length} piscines (${skippedRestricted} installations restreintes écartées)`,
  );
  return pools;
}
