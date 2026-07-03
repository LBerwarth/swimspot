/**
 * Source Allemagne : Bäderleben (Bundesinstitut für Sportwissenschaft, projet
 * BISp) — base nationale des piscines : ~9 700 bäder ouverts, 140+ attributs
 * dont tarifs d'entrée, coordonnées et bassins détaillés.
 *
 * Accès par l'API du formulaire « Bäder suchen » (baederleben.de/abfragen) :
 *   1. POST /api/abfragen action=baederSuche — recherche nationale, renvoie
 *      les identifiants des bäder ;
 *   2. POST /api/abfragen action=baederExport — génère l'export officiel :
 *      un ZIP de deux CSV (bäder + becken) au-delà de 3 000 résultats.
 *
 * Attribution requise (nutzungsbedingungen.php) :
 * « © Bundesinstitut für Sportwissenschaft » ; coordonnées
 * « © GeoBasis-DE / BKG (2021) ».
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import type { Pool, PoolEnv } from "../../lib/types";

const API_URL = "https://baederleben.de/api/abfragen";
const PAGE_URL = "https://baederleben.de/abfragen/baeder-suche.php";
// L'API sert le même contenu qu'au navigateur ; on s'identifie comme tel.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: PAGE_URL,
  "X-Requested-With": "XMLHttpRequest",
};

/**
 * Types de bad demandés à la recherche (valeurs du formulaire) : uniquement
 * ceux ouverts au grand public. Écartés : 5 Schulbad (scolaire), 8 Hotelbad,
 * 9 Klinikbad (médical), 10 Sonstiges Bad (Ehpad, wellness, crèches…),
 * 11 Natürliche Badestelle (baignade sauvage sans infrastructure).
 */
const PUBLIC_BADTYPEN = ["1", "2", "3", "4", "6", "7"];

/** Même filtre côté CSV (utile quand on lit un export local complet). */
const KEPT_BADTYP = new Set([
  "Hallenbad", "Freibad", "Kombibad", "Cabriobad", "Freizeitbad", "Naturbad",
]);

/** Badtyp → environnement ; Freizeitbad est résolu d'après ses bassins. */
const BADTYP_ENV: Record<string, PoolEnv> = {
  Hallenbad: "int",
  Freibad: "ext",
  Kombibad: "mix",
  Cabriobad: "mix", // toit ouvrant, équivalent « découvrable »
  Naturbad: "ext",
};

/**
 * Beckentyp → étiquette courte de bassin. On réutilise le vocabulaire
 * français existant (voir lib/i18n.ts) ; les types sans équivalent reçoivent
 * une étiquette dérivée, rendue par `basinFallback` (« bassin naturel »…).
 */
const BECKEN_LABELS: Record<string, string> = {
  Schwimmerbecken: "sportif",
  Variobecken: "mixte", // profondeur variable (hubboden), usage mixte
  Nichtschwimmerbecken: "ludique",
  Kursbecken: "apprentissage",
  "Tauch- und Sprungbecken": "plongeon",
  Kleinkinderbecken: "pataugeoire",
  Wellenbecken: "vagues",
  Warmsprudelbecken: "spa",
  "Kaltwasser-Tretbecken": "kneipp",
  Naturbecken: "naturel",
};

/**
 * Bäder à écarter d'après leur nom, même philosophie que le filtre France :
 * la classification Badtyp laisse passer des bassins scolaires, de clubs,
 * de cliniques ou d'hôtels rangés en « Hallenbad »/« Freibad ».
 */
const RESTRICTED_NAME_RE = new RegExp(
  [
    "schul", "lehrschwimm", "hochschul", "universität", "sportinternat",
    "internat(?!ional)",
    "kaserne", "bundeswehr", "polizei",
    "klinik", "\\breha\\b", "krankenhaus", "sanatorium", "therapie",
    "justizvollzug", "\\bjva\\b",
    "hotel", "camping", "ferienpark", "feriendorf",
    "vereinsbad", "kita", "kindergarten", "seniorenheim", "pflegeheim",
  ].join("|"),
  "i",
);

/** Emprise approximative de l'Allemagne, pour écarter les coordonnées aberrantes. */
const DE_BBOX = { minLat: 47, maxLat: 55.2, minLon: 5.5, maxLon: 15.5 };

interface SucheResponse {
  success: boolean;
  data: Array<{ bid: number }>;
}

interface ExportResponse {
  url?: string;
  filename?: string;
}

async function postApi<T>(params: URLSearchParams): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Bäderleben : HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Extraction ZIP minimaliste (déflate uniquement), sans dépendance :
 * lecture du répertoire central depuis la fin du fichier.
 */
function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Bäderleben : ZIP invalide (EOCD introuvable)");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) {
      throw new Error("Bäderleben : ZIP invalide (répertoire central)");
    }
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    // L'en-tête local peut avoir des longueurs nom/extra différentes.
    const dataStart =
      localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const data = buf.subarray(dataStart, dataStart + compSize);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Parseur CSV RFC 4180 (guillemets doublés, retours à la ligne cités). */
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

/** CSV → objets indexés par nom de colonne (en-tête = première ligne). */
function csvToObjects(text: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(text);
  return rows
    .filter((r) => r.length >= header.length - 1 && r.some((v) => v !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** « 4.2 » → « 4,20 € », « 7 » → « 7 € » (format allemand). */
function formatEintritt(value: number): string {
  return (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",")) + " €";
}

/** Télécharge l'export national officiel (ZIP bäder + becken). */
async function downloadExport(): Promise<Buffer> {
  console.log("Recherche Bäderleben (bäder ouverts, types publics)…");
  const search = new URLSearchParams({
    action: "baederSuche",
    bundesland: "",
    kreis: "",
    gemeinde: "",
    plz: "",
    badStatus: "0", // uniquement les bäder non fermés définitivement
  });
  for (const t of PUBLIC_BADTYPEN) search.append("badTypen[]", t);
  const found = await postApi<SucheResponse>(search);
  if (!found.success || !Array.isArray(found.data)) {
    throw new Error("Bäderleben : réponse de recherche inattendue");
  }
  const ids = found.data.map((b) => b.bid);
  console.log(`Bäderleben : ${ids.length} bäder trouvés, export…`);

  const exp = await postApi<ExportResponse>(
    new URLSearchParams({ action: "baederExport", badIds: ids.join(",") }),
  );
  if (!exp.url || !/\.zip$/i.test(exp.filename ?? exp.url)) {
    throw new Error(`Bäderleben : export inattendu (${exp.filename ?? exp.url})`);
  }
  const res = await fetch(exp.url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`Bäderleben : téléchargement ZIP HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Charge les piscines allemandes. `localFile` : chemin d'un ZIP d'export
 * Bäderleben déjà téléchargé (cache), comme le fichier local de fr.mts.
 */
export async function loadGermany(localFile?: string): Promise<Pool[]> {
  const zip = localFile ? readFileSync(localFile) : await downloadExport();

  const entries = [...unzip(zip).entries()];
  const baederCsv = entries.find(([name]) => /_baeder_/.test(name))?.[1];
  const beckenCsv = entries.find(([name]) => /_becken_/.test(name))?.[1];
  if (!baederCsv || !beckenCsv) {
    throw new Error("Bäderleben : CSV bäder/becken introuvables dans le ZIP");
  }
  const baeder = csvToObjects(baederCsv.toString("utf8"));
  const becken = csvToObjects(beckenCsv.toString("utf8"));
  console.log(`Bäderleben : ${baeder.length} bäder, ${becken.length} bassins`);

  // Regrouper les bassins par bad.
  const beckenByBad = new Map<string, Array<Record<string, string>>>();
  for (const b of becken) {
    const list = beckenByBad.get(b["Bad-ID"]) ?? [];
    list.push(b);
    beckenByBad.set(b["Bad-ID"], list);
  }

  const pools: Pool[] = [];
  const skipped = { type: 0, name: 0, private: 0, closed: 0, coords: 0 };

  for (const bad of baeder) {
    if (!KEPT_BADTYP.has(bad["Badtyp"])) {
      skipped.type++;
      continue;
    }
    if (RESTRICTED_NAME_RE.test(bad["Name"])) {
      skipped.name++;
      continue;
    }
    // Drapeau explicite « pas de nutzung par les habitants » (clubs, écoles).
    if (bad["Nutzung durch Bürger"] === "nein") {
      skipped.private++;
      continue;
    }
    if (
      bad["Anlage dauerhaft geschlossen"] === "ja" ||
      bad["Anlage temporär geschlossen"] === "ja"
    ) {
      skipped.closed++;
      continue;
    }
    const lat = Number.parseFloat(bad["Breitengrad"]);
    const lon = Number.parseFloat(bad["Längengrad"]);
    if (
      !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < DE_BBOX.minLat || lat > DE_BBOX.maxLat ||
      lon < DE_BBOX.minLon || lon > DE_BBOX.maxLon
    ) {
      skipped.coords++;
      continue;
    }

    const basins = beckenByBad.get(bad["Bad-ID"]) ?? [];

    // Longueurs plafonnées à 200 m : au-delà, les Naturbäder indiquent la
    // distance de nage du plan d'eau (300–5 000 m), pas un bassin. Le plus
    // grand bassin réel recensé est la Waschmühle à Kaiserslautern (165,3 m).
    const lens = [
      ...new Set(
        basins
          .map((b) => Number.parseFloat(b["Länge"]))
          .filter((v) => Number.isFinite(v) && v > 0 && v <= 200)
          .map((v) => Math.round(v * 10) / 10),
      ),
    ].sort((a, b) => b - a);

    const basinLabels = [
      ...new Set(
        basins
          .map((b) => BECKEN_LABELS[b["Beckentyp"]])
          .filter((l): l is string => !!l),
      ),
    ];
    if (bad["Großrutsche"] === "ja" && !basinLabels.includes("toboggan")) {
      basinLabels.push("toboggan");
    }

    // Environnement : Badtyp fait foi ; Freizeitbad d'après la Lage des bassins.
    let env = BADTYP_ENV[bad["Badtyp"]];
    if (!env) {
      const lagen = new Set(basins.map((b) => b["Lage des Beckens"]).filter(Boolean));
      env =
        lagen.has("Mischform") || lagen.has("Cabriobecken") ||
        (lagen.has("Innen") && lagen.has("Außen"))
          ? "mix"
          : lagen.has("Außen")
            ? "ext"
            : "int"; // Freizeitbad (« Spaßbad ») : couvert par défaut
    }

    // Tarif adulte : nombre en euros ; 0 = entrée gratuite.
    const eintritt = Number.parseFloat(bad["Eintritt Erwachsene"].replace(",", "."));
    const charge =
      Number.isFinite(eintritt) && eintritt > 0 ? formatEintritt(eintritt) : undefined;
    const free = eintritt === 0;

    const rawSite = bad["Webseite"];
    const website =
      rawSite && !/\s/.test(rawSite) && rawSite.includes(".")
        ? /^https?:\/\//i.test(rawSite)
          ? rawSite
          : `https://${rawSite}`
        : undefined;
    const phone = bad["Telefon"];

    pools.push({
      id: `DE${bad["Bad-ID"]}`,
      name: bad["Name"],
      city: bad["Ort"],
      cp: bad["Postleitzahl"],
      ...(bad["Straße"] ? { address: bad["Straße"] } : {}),
      country: "DE",
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      env,
      ...(lens.length ? { lens } : {}),
      basins: basinLabels,
      ...(charge ? { charge } : {}),
      ...(free ? { fee: false } : {}),
      ...(website ? { website } : {}),
      ...(phone ? { phone } : {}),
    });
  }

  console.log(
    `Allemagne : ${pools.length} piscines (écartées : ${skipped.type} type non ` +
      `public, ${skipped.name} nom restreint, ${skipped.private} fermées au ` +
      `public, ${skipped.closed} fermées, ${skipped.coords} coordonnées invalides)`,
  );
  return pools;
}
