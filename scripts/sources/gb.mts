/**
 * Source Angleterre : Active Places (Sport England, licence OGL v3) —
 * base nationale des équipements sportifs, mise à jour quotidienne.
 * Accès par l'API REST ArcGIS publique (pas d'authentification).
 */
import type { Pool } from "../../lib/types";

const ARCGIS_BASE =
  "https://services-eu1.arcgis.com/s9MgJChYyPlPX2Nk/arcgis/rest/services";
const POOLS_URL = `${ARCGIS_BASE}/GIS_Active_Places_Power_Swimming_Pools/FeatureServer/16/query`;
const SITES_URL = `${ARCGIS_BASE}/GIS_Active_Places_Power_Sites/FeatureServer/0/query`;
const PAGE_SIZE = 2000;

interface PoolRow {
  siteid: number;
  facilitysubtype: string | null;
  length: number | null;
  lat: number | null;
  long: number | null;
}

interface SiteRow {
  siteid: number;
  sitename: string | null;
  thoroughfarename: string | null;
  posttown: string | null;
  postcode: string | null;
  website: string | null;
  lat: number | null;
  long: number | null;
}

const SUBTYPE_LABELS: Record<string, string> = {
  "Main/General": "principal",
  "Leisure Pool": "ludique",
  "Learner/Teaching/Training": "apprentissage",
  Lido: "lido",
  Diving: "plongeon",
};

/** Sous-types de plein air ; le reste est couvert. */
const OUTDOOR_SUBTYPES = new Set(["Lido"]);

async function queryAll<T>(url: string, params: Record<string, string>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const qs = new URLSearchParams({
      ...params,
      f: "json",
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
    });
    // Réessaie les coupures réseau transitoires (ECONNRESET…).
    let data: { error?: unknown; exceededTransferLimit?: boolean; features?: Array<{ attributes: T }> };
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${url}?${qs}`);
        if (!res.ok) throw new Error(`Active Places : HTTP ${res.status}`);
        data = await res.json();
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    if (data.error) throw new Error(`Active Places : ${JSON.stringify(data.error)}`);
    const features: Array<{ attributes: T }> = data.features ?? [];
    rows.push(...features.map((f) => f.attributes));
    if (!data.exceededTransferLimit && features.length < PAGE_SIZE) break;
  }
  return rows;
}

/** « MIDDLETON PARK » → « Middleton Park ». */
function titleCaseEN(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\p{L}]+/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1))
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadEngland(): Promise<Pool[]> {
  console.log("Téléchargement Active Places (Sport England)…");
  const [poolRows, siteRows] = await Promise.all([
    queryAll<PoolRow>(POOLS_URL, {
      where: "facstatus='Operational' AND accessibilitytypestr<>'Private Use'",
      outFields: "siteid,facilitysubtype,length,lat,long",
    }),
    queryAll<SiteRow>(SITES_URL, {
      where: "1=1",
      outFields: "siteid,sitename,thoroughfarename,posttown,postcode,website,lat,long",
    }),
  ]);
  console.log(`Active Places : ${poolRows.length} bassins, ${siteRows.length} sites`);

  const siteById = new Map(siteRows.map((s) => [s.siteid, s]));

  const bySite = new Map<number, PoolRow[]>();
  for (const row of poolRows) {
    const list = bySite.get(row.siteid) ?? [];
    list.push(row);
    bySite.set(row.siteid, list);
  }

  const pools: Pool[] = [];
  let skippedNoSite = 0;

  for (const [siteid, basins] of bySite) {
    const site = siteById.get(siteid);
    const lat = site?.lat ?? basins.find((b) => b.lat != null)?.lat;
    const lon = site?.long ?? basins.find((b) => b.long != null)?.long;
    if (!site || lat == null || lon == null || !site.sitename) {
      skippedNoSite++;
      continue;
    }

    const subtypes = basins
      .map((b) => b.facilitysubtype)
      .filter((s): s is string => !!s);
    const outdoor = subtypes.filter((s) => OUTDOOR_SUBTYPES.has(s)).length;
    const env =
      outdoor === 0 ? ("int" as const)
      : outdoor === subtypes.length ? ("ext" as const)
      : ("mix" as const);

    const lens = [
      ...new Set(
        basins
          .map((b) => b.length)
          .filter((v): v is number => typeof v === "number" && v > 0)
          .map((v) => Math.round(v * 10) / 10),
      ),
    ].sort((a, b) => b - a);

    const basinLabels = [
      ...new Set(subtypes.map((s) => SUBTYPE_LABELS[s] ?? s.toLowerCase())),
    ];

    const website = site.website?.trim();

    pools.push({
      id: `GB${siteid}`,
      name: titleCaseEN(site.sitename),
      city: site.posttown ? titleCaseEN(site.posttown) : "",
      cp: site.postcode ?? "",
      ...(site.thoroughfarename
        ? { address: titleCaseEN(site.thoroughfarename) }
        : {}),
      country: "GB",
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      env,
      ...(lens.length ? { lens } : {}),
      basins: basinLabels,
      ...(website && /^https?:\/\//i.test(website) ? { website } : {}),
    });
  }

  console.log(
    `Angleterre : ${pools.length} piscines (${skippedNoSite} sans site/coordonnées écartées)`,
  );
  return pools;
}
