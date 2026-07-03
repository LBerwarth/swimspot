import { describe, expect, it } from "vitest";
import {
  formatWeekFR,
  isOpenAt,
  parseOpeningHours,
} from "./opening-hours";

describe("parseOpeningHours", () => {
  it("interprète une plage jours + horaires simple", () => {
    const week = parseOpeningHours("Mo-Fr 09:00-19:00");
    expect(week).not.toBeNull();
    expect(week![0]).toEqual([[540, 1140]]);
    expect(week![4]).toEqual([[540, 1140]]);
    expect(week![5]).toEqual([]); // samedi non mentionné = fermé
  });

  it("gère plusieurs règles et plages multiples", () => {
    const week = parseOpeningHours(
      "Mo-Fr 12:00-13:30,17:00-20:00; Sa,Su 10:00-18:00",
    );
    expect(week![0]).toEqual([
      [720, 810],
      [1020, 1200],
    ]);
    expect(week![6]).toEqual([[600, 1080]]);
  });

  it("gère 24/7", () => {
    const week = parseOpeningHours("24/7");
    expect(week![3]).toEqual([[0, 1440]]);
  });

  it("gère les jours explicitement fermés", () => {
    const week = parseOpeningHours("Tu-Su 10:00-19:00; Mo off");
    expect(week![0]).toEqual([]);
    expect(week![1]).toEqual([[600, 1140]]);
  });

  it("ignore « PH off » sans invalider la semaine", () => {
    const week = parseOpeningHours("Mo-Su 09:00-20:00; PH off");
    expect(week).not.toBeNull();
    expect(week![6]).toEqual([[540, 1200]]);
  });

  it("gère un intervalle de jours qui boucle (Sa-Mo)", () => {
    const week = parseOpeningHours("Sa-Mo 10:00-12:00");
    expect(week![5]).toEqual([[600, 720]]);
    expect(week![6]).toEqual([[600, 720]]);
    expect(week![0]).toEqual([[600, 720]]);
    expect(week![1]).toEqual([]);
  });

  it("refuse les motifs hors périmètre plutôt que de les déformer", () => {
    expect(parseOpeningHours("Jun-Aug: Mo-Su 10:00-20:00")).toBeNull();
    expect(parseOpeningHours("Mo-Fr 09:00-19:00 || \"sur réservation\"")).toBeNull();
    expect(parseOpeningHours("SH Mo-Fr 10:00-18:00")).toBeNull();
    expect(parseOpeningHours("sur rendez-vous")).toBeNull();
  });
});

describe("formatWeekFR", () => {
  it("regroupe les jours consécutifs identiques", () => {
    const week = parseOpeningHours("Mo-Fr 09:00-19:30; Sa,Su 10:00-18:00")!;
    const lines = formatWeekFR(week);
    expect(lines).toEqual([
      { days: "lun–ven", hours: "9h–19h30" },
      { days: "sam–dim", hours: "10h–18h" },
    ]);
  });

  it("affiche les jours fermés", () => {
    const week = parseOpeningHours("Tu-Su 10:00-18:00")!;
    const lines = formatWeekFR(week);
    expect(lines[0]).toEqual({ days: "lun", hours: "fermé" });
  });
});

describe("isOpenAt", () => {
  const week = parseOpeningHours("Mo-Fr 09:00-19:00")!;

  it("ouvert un mercredi à 10h", () => {
    // 4 mars 2026 = mercredi.
    expect(isOpenAt(week, new Date(2026, 2, 4, 10, 0))).toBe(true);
  });

  it("fermé un mercredi à 20h", () => {
    expect(isOpenAt(week, new Date(2026, 2, 4, 20, 0))).toBe(false);
  });

  it("fermé le dimanche", () => {
    // 8 mars 2026 = dimanche.
    expect(isOpenAt(week, new Date(2026, 2, 8, 10, 0))).toBe(false);
  });
});
