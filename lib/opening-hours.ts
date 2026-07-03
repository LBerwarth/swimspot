/**
 * Interprétation *best effort* du format OSM `opening_hours`.
 *
 * On ne couvre volontairement que les motifs simples et majoritaires
 * (jours + plages horaires, « 24/7 », « PH off »). Tout motif plus riche
 * (saisons, mois, semaines, « || », événements…) fait renvoyer `null` :
 * l'interface affiche alors la chaîne brute plutôt qu'une interprétation
 * potentiellement fausse.
 */

const DAY_CODES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const DAY_LABELS_FR = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;

/** Plages d'ouverture par jour (0 = lundi … 6 = dimanche), en minutes depuis minuit. */
export type WeekSchedule = Array<Array<[number, number]>>;

const DAY_TOKEN = "(?:Mo|Tu|We|Th|Fr|Sa|Su)";
const DAY_SPEC_RE = new RegExp(
  `^(${DAY_TOKEN}(?:-${DAY_TOKEN})?(?:,${DAY_TOKEN}(?:-${DAY_TOKEN})?)*)\\s+(.+)$`,
);
const TIME_RANGE_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*$/;

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

/** Renvoie le planning hebdomadaire, ou `null` si la chaîne dépasse les motifs gérés. */
export function parseOpeningHours(value: string): WeekSchedule | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned === "24/7") {
    return Array.from({ length: 7 }, () => [[0, 24 * 60] as [number, number]]);
  }
  if (cleaned.includes("||")) return null;

  // Jours non mentionnés = fermés (sémantique OSM).
  const week: WeekSchedule = Array.from({ length: 7 }, () => []);
  let sawRule = false;

  for (const rawRule of cleaned.split(";")) {
    const rule = rawRule.trim();
    if (!rule) continue;
    // « PH off » / « SH off » : sans impact sur la semaine type, on ignore.
    if (/^(PH|SH)\s+(off|closed)$/i.test(rule)) continue;
    // Toute autre règle sur jours fériés / vacances est hors périmètre.
    if (/\b(PH|SH)\b/.test(rule)) return null;

    let days: number[];
    let rest: string;
    const m = rule.match(DAY_SPEC_RE);
    if (m) {
      const parsed = parseDaySpec(m[1]);
      if (!parsed) return null;
      days = parsed;
      rest = m[2].trim();
    } else {
      days = [0, 1, 2, 3, 4, 5, 6];
      rest = rule;
    }

    if (/^(off|closed)$/i.test(rest)) {
      for (const d of days) week[d] = [];
      sawRule = true;
      continue;
    }

    const times = parseTimes(rest);
    if (!times) return null;
    // Les règles suivantes remplacent les précédentes pour les jours cités.
    for (const d of days) week[d] = times.slice();
    sawRule = true;
  }

  return sawRule ? week : null;
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
