import { describe, expect, it } from "vitest";
import {
  formatWeekFR,
  isOpenAt,
  parseOpeningHours,
  prettifyOpeningHours,
} from "./opening-hours";

describe("parseOpeningHours", () => {
  it("interprète une plage jours + horaires simple", () => {
    const parsed = parseOpeningHours("Mo-Fr 09:00-19:00");
    expect(parsed).not.toBeNull();
    expect(parsed!.week[0]).toEqual([[540, 1140]]);
    expect(parsed!.week[4]).toEqual([[540, 1140]]);
    expect(parsed!.week[5]).toEqual([]); // samedi non mentionné = fermé
    expect(parsed!.holidayWeek).toBeUndefined();
    expect(parsed!.extras).toEqual([]);
  });

  it("gère plusieurs règles et plages multiples", () => {
    const parsed = parseOpeningHours(
      "Mo-Fr 12:00-13:30,17:00-20:00; Sa,Su 10:00-18:00",
    );
    expect(parsed!.week[0]).toEqual([
      [720, 810],
      [1020, 1200],
    ]);
    expect(parsed!.week[6]).toEqual([[600, 1080]]);
  });

  it("gère 24/7", () => {
    const parsed = parseOpeningHours("24/7");
    expect(parsed!.week[3]).toEqual([[0, 1440]]);
  });

  it("gère les jours explicitement fermés", () => {
    const parsed = parseOpeningHours("Tu-Su 10:00-19:00; Mo off");
    expect(parsed!.week[0]).toEqual([]);
    expect(parsed!.week[1]).toEqual([[600, 1140]]);
  });

  it("ignore « PH off » sans invalider la semaine", () => {
    const parsed = parseOpeningHours("Mo-Su 09:00-20:00; PH off");
    expect(parsed).not.toBeNull();
    expect(parsed!.week[6]).toEqual([[540, 1200]]);
  });

  it("gère un intervalle de jours qui boucle (Sa-Mo)", () => {
    const parsed = parseOpeningHours("Sa-Mo 10:00-12:00");
    expect(parsed!.week[5]).toEqual([[600, 720]]);
    expect(parsed!.week[6]).toEqual([[600, 720]]);
    expect(parsed!.week[0]).toEqual([[600, 720]]);
    expect(parsed!.week[1]).toEqual([]);
  });

  it("sépare les règles SH en planning « vacances scolaires » (cas Léo Lagrange)", () => {
    const parsed = parseOpeningHours(
      "Mo 16:00-21:00; Tu 08:30-09:00,16:00-21:00; We 08:30-14:00,16:00-19:15; " +
        "Th-Fr 08:30-09:00,16:00-18:00; Sa-Su 08:30-15:00; SH Mo 14:00-21:00; " +
        "SH Tu-We 09:00-12:00,14:00-21:00; SH Th-Fr 09:00-12:00,14:00-18:00",
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.week[0]).toEqual([[960, 1260]]); // lundi scolaire 16h-21h
    expect(parsed!.holidayWeek).toBeDefined();
    expect(parsed!.holidayWeek![0]).toEqual([[840, 1260]]); // lundi vacances 14h-21h
    expect(parsed!.holidayWeek![5]).toEqual([]); // samedi vacances non mentionné
    expect(parsed!.extras).toEqual([]);
  });

  it("restitue les règles datées en français sans les interpréter (cas Toulouse-Lautrec)", () => {
    const parsed = parseOpeningHours(
      "Su 11:30-18:00;Sa 07:00-14:00;Th 07:00-09:00,12:00-14:00,16:00-19:00;" +
        "We 12:00-19:00;Oct 17-Nov 2 Mo-Fr 09:00-16:00;" +
        "Mo,Tu,Fr 12:00-14:00,16:00-19:00;Feb 20-Mar 7 Mo-Fr 09:00-16:00",
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.week[6]).toEqual([[690, 1080]]); // dimanche 11h30-18h
    expect(parsed!.week[0]).toEqual([
      [720, 840],
      [960, 1140],
    ]);
    expect(parsed!.extras).toEqual([
      "17 oct.–2 nov. lun–ven 9h–16h",
      "20 févr.–7 mars lun–ven 9h–16h",
    ]);
  });

  it("restitue « PH » avec horaires en période particulière", () => {
    const parsed = parseOpeningHours("Mo-Fr 09:00-19:00; PH 10:00-12:00");
    expect(parsed!.extras).toEqual(["jours fériés 10h–12h"]);
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
    const parsed = parseOpeningHours("Mo-Fr 09:00-19:30; Sa,Su 10:00-18:00")!;
    const lines = formatWeekFR(parsed.week);
    expect(lines).toEqual([
      { days: "lun–ven", hours: "9h–19h30" },
      { days: "sam–dim", hours: "10h–18h" },
    ]);
  });

  it("affiche les jours fermés", () => {
    const parsed = parseOpeningHours("Tu-Su 10:00-18:00")!;
    const lines = formatWeekFR(parsed.week);
    expect(lines[0]).toEqual({ days: "lun", hours: "fermé" });
  });
});

describe("isOpenAt", () => {
  const parsed = parseOpeningHours("Mo-Fr 09:00-19:00")!;

  it("ouvert un mercredi à 10h", () => {
    // 4 mars 2026 = mercredi.
    expect(isOpenAt(parsed.week, new Date(2026, 2, 4, 10, 0))).toBe(true);
  });

  it("fermé un mercredi à 20h", () => {
    expect(isOpenAt(parsed.week, new Date(2026, 2, 4, 20, 0))).toBe(false);
  });

  it("fermé le dimanche", () => {
    // 8 mars 2026 = dimanche.
    expect(isOpenAt(parsed.week, new Date(2026, 2, 8, 10, 0))).toBe(false);
  });
});

describe("prettifyOpeningHours", () => {
  it("reformate en français une chaîne non interprétable, une ligne par règle", () => {
    expect(
      prettifyOpeningHours("Jun 15-Sep 1: Mo-Su 10:00-20:00; PH off"),
    ).toEqual(["15 juin–1 sept.: lun–dim 10h–20h", "jours fériés fermé"]);
  });
});
