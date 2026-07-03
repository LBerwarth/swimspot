/**
 * Interprétation *best effort* du format OSM `opening_hours`.
 *
 * Motifs gérés : jours + plages horaires, « 24/7 », « PH off », règles « SH »
 * (vacances scolaires) — fréquentes pour les piscines françaises — rendues
 * comme un second planning, et règles bornées par des dates (« Oct 17-Nov 2 … »)
 * restituées telles quelles en français. Tout le reste fait renvoyer `null` :
 * l'interface affiche alors la chaîne brute joliment reformatée plutôt qu'une
 * interprétation potentiellement fausse.
 */

const DAY_CODES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const DAY_LABELS_FR = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;

const MONTH_CODES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const MONTH_LABELS_FR = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
] as const;

/** Plages d'ouverture par jour (0 = lundi … 6 = dimanche), en minutes depuis minuit. */
export type WeekSchedule = Array<Array<[number, number]>>;

export interface ParsedOpeningHours {
  /** Planning par défaut (période scolaire quand des règles SH existent). */
  week: WeekSchedule;
  /** Planning des vacances scolaires (règles « SH »), s'il y en a. */
  holidayWeek?: WeekSchedule;
  /** Règles bornées par des dates, reformatées en français, non interprétées. */
  extras: string[];
}

const DAY_TOKEN = "(?:Mo|Tu|We|Th|Fr|Sa|Su)";
const DAY_SPEC_RE = new RegExp(
  `^(${DAY_TOKEN}(?:-${DAY_TOKEN})?(?:,${DAY_TOKEN}(?:-${DAY_TOKEN})?)*)\\s+(.+)$`,
);
const TIME_RANGE_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*$/;
const MONTH_START_RE = new RegExp(`^(?:${MONTH_CODES.join("|")})\\b`);

function emptyWeek(): WeekSchedule {
  return Array.from({ length: 7 }, () => []);
}

function parseDaySpec(spec: string): number[] | null {
  const days: number[] = [];
  for (const part of spec.split(",")) {
    const [from, to] = part.split("-");
    const a = DAY_CODES.indexOf(from as (typeof DAY_CODES)[number]);
    if (a < 0) return null;
    if (to === undefined) {
      days.push(a);
      continue;
    }
    const b = DAY_CODES.indexOf(to as (typeof DAY_CODES)[number]);
    if (b < 0) return null;
    // Un intervalle peut boucler sur la semaine (ex. Sa-Mo).
    for (let d = a; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === b) break;
    }
  }
  return days;
}

function parseTimes(spec: string): Array<[number, number]> | null {
  if (!TIME_RANGE_RE.test(spec)) return null;
  const ranges: Array<[number, number]> = [];
  for (const range of spec.split(",")) {
    const [start, end] = range.split("-");
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const s = toMin(start);
    const e = toMin(end);
    if (s > 24 * 60 || e > 24 * 60 || e <= s) return null;
    ranges.push([s, e]);
  }
  return ranges;
}

/** Applique une règle « jours + horaires » (ou « jours off ») à un planning. */
function applyRule(week: WeekSchedule, rule: string): boolean {
  let days: number[];
  let rest: string;
  const m = rule.match(DAY_SPEC_RE);
  if (m) {
    const parsed = parseDaySpec(m[1]);
    if (!parsed) return false;
    days = parsed;
    rest = m[2].trim();
  } else {
    days = [0, 1, 2, 3, 4, 5, 6];
    rest = rule;
  }

  if (/^(off|closed)$/i.test(rest)) {
    for (const d of days) week[d] = [];
    return true;
  }

  const times = parseTimes(rest);
  if (!times) return false;
  // Les règles suivantes remplacent les précédentes pour les jours cités.
  for (const d of days) week[d] = times.slice();
  return true;
}

/** Renvoie les plannings, ou `null` si la chaîne dépasse les motifs gérés. */
export function parseOpeningHours(value: string): ParsedOpeningHours | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned === "24/7") {
    return {
      week: Array.from({ length: 7 }, () => [[0, 24 * 60] as [number, number]]),
      extras: [],
    };
  }
  if (cleaned.includes("||")) return null;

  // Jours non mentionnés = fermés (sémantique OSM).
  const week = emptyWeek();
  let holidayWeek: WeekSchedule | undefined;
  const extras: string[] = [];
  let sawBase = false;

  for (const rawRule of cleaned.split(";")) {
    const rule = rawRule.trim();
    if (!rule) continue;
    // « PH off » : sans impact sur la semaine type, on ignore.
    if (/^PH\s+(off|closed)$/i.test(rule)) continue;
    // Jours fériés avec horaires : restitué tel quel, sans interprétation.
    if (/^PH\b/.test(rule)) {
      extras.push(prettifySegment(rule));
      continue;
    }
    // « SH … » : planning des vacances scolaires.
    const sh = rule.match(/^SH\s+(.+)$/);
    if (sh) {
      if (/^(off|closed)$/i.test(sh[1].trim())) continue;
      holidayWeek ??= emptyWeek();
      if (!applyRule(holidayWeek, sh[1].trim())) return null;
      continue;
    }
    // Règle bornée par des dates (« Oct 17-Nov 2 Mo-Fr 09:00-16:00 ») :
    // restituée en français sans être appliquée à la semaine type.
    if (MONTH_START_RE.test(rule)) {
      extras.push(prettifySegment(rule));
      continue;
    }

    if (!applyRule(week, rule)) return null;
    sawBase = true;
  }

  if (!sawBase) return null;
  return { week, ...(holidayWeek ? { holidayWeek } : {}), extras };
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function formatRanges(ranges: Array<[number, number]>): string {
  return ranges.map(([s, e]) => `${formatTime(s)}–${formatTime(e)}`).join(", ");
}

export interface ScheduleLine {
  days: string;
  hours: string;
}

/** Regroupe les jours consécutifs identiques : « lun–ven · 9h–19h ». */
export function formatWeekFR(week: WeekSchedule): ScheduleLine[] {
  const lines: ScheduleLine[] = [];
  let start = 0;
  while (start < 7) {
    const key = JSON.stringify(week[start]);
    let end = start;
    while (end + 1 < 7 && JSON.stringify(week[end + 1]) === key) end++;
    const days =
      start === end
        ? DAY_LABELS_FR[start]
        : `${DAY_LABELS_FR[start]}–${DAY_LABELS_FR[end]}`;
    const hours = week[start].length === 0 ? "fermé" : formatRanges(week[start]);
    lines.push({ days, hours });
    start = end + 1;
  }
  return lines;
}

/** Piscine ouverte à l'instant `now` d'après le planning hebdomadaire. */
export function isOpenAt(week: WeekSchedule, now: Date): boolean {
  const day = (now.getDay() + 6) % 7; // Date.getDay() : 0 = dimanche.
  const minutes = now.getHours() * 60 + now.getMinutes();
  return week[day].some(([s, e]) => minutes >= s && minutes < e);
}

/** Traduit un segment OSM en français lisible, sans l'interpréter. */
function prettifySegment(segment: string): string {
  let out = segment.trim();
  // Plages horaires : « 08:30-14:00 » → « 8h30–14h ».
  out = out.replace(
    /(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/g,
    (_, h1, m1, h2, m2) =>
      `${+h1}h${m1 === "00" ? "" : m1}–${+h2}h${m2 === "00" ? "" : m2}`,
  );
  out = out.replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => `${+h}h${m === "00" ? "" : m}`);
  // Mois : « Oct 17 » → « 17 oct. » (après traduction du code mois).
  MONTH_CODES.forEach((code, i) => {
    out = out.replace(new RegExp(`\\b${code}\\b`, "g"), MONTH_LABELS_FR[i]);
  });
  const monthAlt = MONTH_LABELS_FR.map((m) => m.replace(".", "\\.")).join("|");
  out = out.replace(new RegExp(`(${monthAlt})\\s?(\\d{1,2})\\b`, "g"), "$2 $1");
  // Jours : « Th-Fr » → « jeu–ven ».
  DAY_CODES.forEach((code, i) => {
    out = out.replace(new RegExp(`\\b${code}\\b`, "g"), DAY_LABELS_FR[i]);
  });
  out = out.replace(/(lun|mar|mer|jeu|ven|sam|dim)-(lun|mar|mer|jeu|ven|sam|dim)/g, "$1–$2");
  // Divers.
  out = out.replace(/\b(off|closed)\b/gi, "fermé");
  out = out.replace(/\bPH\b/g, "jours fériés");
  out = out.replace(/\bSH\b/g, "vacances scolaires");
  out = out.replace(/\b24\/7\b/g, "24h/24, 7j/7");
  // Tirets restants (séparateurs de dates comme « 17 oct.-2 nov. ») → tiret long.
  out = out.replace(/-/g, "–");
  return out;
}

/**
 * Repli d'affichage pour une chaîne `opening_hours` non interprétable :
 * une ligne en français par règle, sans garantie sémantique.
 */
export function prettifyOpeningHours(value: string): string[] {
  return value
    .split(/;|\|\|/)
    .map((seg) => prettifySegment(seg))
    .filter(Boolean);
}
