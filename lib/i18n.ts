/**
 * Internationalisation de Swimspot. Une langue par pays couvert :
 * français (France) et anglais (Angleterre) — l'allemand suivra avec
 * l'Allemagne. Dictionnaires plats, quelques entrées fonctions pour les
 * chaînes paramétrées.
 */

export type Locale = "fr" | "en";
export const LOCALES: Locale[] = ["fr", "en"];
export const DEFAULT_LOCALE: Locale = "fr";

export interface Dict {
  metaTitle: string;
  metaDescription: string;
  subtitle: string;

  searchPlaceholder: string;
  searchAria: string;
  locateButton: string;
  locating: string;
  errNoGeolocation: string;
  errGeoDenied: string;
  errSearchDown: string;

  savedAddressesAria: string;
  saveAddress: string;
  removeAddress: (label: string) => string;

  radiusLabel: string;
  radiusAria: string;
  typeLabel: string;
  typeAria: string;
  typeAll: string;
  typeIndoor: string;
  typeOutdoor: string;
  openLabel: string;
  openAria: string;
  openTitle: string;
  openAll: string;
  openNow: string;
  openToday: string;
  favLabel: string;
  favAria: string;
  favAll: string;
  favOnly: string;
  lenLabel: string;
  lenAria: string;
  lenAll: string;

  loadError: string;
  emptyTitle: string;
  emptyHint: string;
  referenced: (n: string) => string;
  loadingPools: string;
  noneInRadius: string;
  noneFavorite: string;
  countLine: (n: number, radiusKm: number, label: string) => string;
  showMore: (n: number) => string;
  mapAria: string;

  distanceTitle: string;
  favAdd: (name: string) => string;
  favRemove: (name: string) => string;
  envLabels: Record<string, string>;
  basinLabels: Record<string, string>;
  basinFallback: (label: string) => string;

  seasonalClosed: string;
  badgeOpenNow: string;
  badgeClosedNow: string;
  badgeClosedToday: string;
  todayLabel: string;
  liveSource: string;
  schoolTerm: string;
  schoolHolidays: string;
  specialPeriods: string;
  hoursLabel: string;
  noHours: string;
  priceLabel: string;
  paidEntry: string;
  freeEntry: string;
  directions: string;
  website: string;
  searchWebsite: string;

  footerData: string;
  footerLicenceFR: string;
  footerLicenceGB: string;
  footerOsm: string;
  footerDisclaimer: string;

  coveredLabel: string;
  countryNames: Record<string, string>;
}

const fr: Dict = {
  metaTitle: "Swimspot — trouvez une piscine près de chez vous",
  metaDescription:
    "Toutes les piscines publiques autour de vous, en France et en Angleterre : " +
    "choisissez un rayon, voyez les bassins, horaires et tarifs disponibles, avec carte et itinéraires.",
  subtitle:
    "Trouvez les piscines publiques autour de vous : bassins, horaires et tarifs quand ils sont connus.",

  searchPlaceholder: "Adresse, ville, code postal…",
  searchAria: "Rechercher une adresse",
  locateButton: "📍 Autour de moi",
  locating: "Localisation…",
  errNoGeolocation: "La géolocalisation n'est pas disponible sur cet appareil.",
  errGeoDenied: "Position refusée ou indisponible — cherchez une adresse à la place.",
  errSearchDown: "Recherche d'adresse indisponible pour le moment.",

  savedAddressesAria: "Adresses enregistrées",
  saveAddress: "☆ Enregistrer",
  removeAddress: (label) => `Supprimer l'adresse ${label}`,

  radiusLabel: "Rayon :",
  radiusAria: "Rayon de recherche",
  typeLabel: "Type :",
  typeAria: "Type de piscine",
  typeAll: "Toutes",
  typeIndoor: "Couvertes",
  typeOutdoor: "Plein air",
  openLabel: "Ouvertes :",
  openAria: "Ouverture",
  openTitle: "D'après les horaires connus (une partie des piscines seulement)",
  openAll: "Peu importe",
  openNow: "Maintenant",
  openToday: "Aujourd'hui",
  favLabel: "Favoris :",
  favAria: "Favoris",
  favAll: "Toutes",
  favOnly: "★ Uniquement",
  lenLabel: "Bassin :",
  lenAria: "Longueur de bassin",
  lenAll: "Toutes longueurs",

  loadError: "Impossible de charger la liste des piscines. Rechargez la page.",
  emptyTitle: "Où cherchez-vous une piscine ?",
  emptyHint: "Touchez « 📍 Autour de moi » ou saisissez une adresse ci-dessus.",
  referenced: (n) => `${n} piscines publiques référencées.`,
  loadingPools: "Chargement des piscines…",
  noneInRadius: "Aucune piscine dans ce rayon — essayez un rayon plus grand.",
  noneFavorite:
    "Aucune piscine favorite dans ce rayon — touchez ☆ sur une piscine pour l'ajouter.",
  countLine: (n, radiusKm, label) =>
    `${n} piscine${n > 1 ? "s" : ""} à moins de ${radiusKm} km à vol d'oiseau de ${label}.`,
  showMore: (n) => `Afficher plus (${n} restantes)`,
  mapAria: "Carte des piscines",

  distanceTitle: "Distance à vol d'oiseau",
  favAdd: (name) => `Ajouter ${name} aux favoris`,
  favRemove: (name) => `Retirer ${name} des favoris`,
  envLabels: { int: "Couverte", ext: "Plein air", mix: "Couverte + plein air" },
  basinLabels: {
    sportif: "bassin sportif",
    ludique: "bassin ludique",
    mixte: "bassin mixte",
    toboggan: "bassin toboggan",
    plongeon: "fosse à plongeon",
    plongée: "fosse à plongée",
    principal: "bassin principal",
    apprentissage: "bassin d'apprentissage",
    lido: "bassin de plein air",
  },
  basinFallback: (label) => `bassin ${label}`,

  seasonalClosed: "Fermeture saisonnière en cours",
  badgeOpenNow: "Ouverte en ce moment",
  badgeClosedNow: "Fermée en ce moment",
  badgeClosedToday: "Fermée aujourd'hui",
  todayLabel: "Aujourd'hui :",
  liveSource: "Statut du jour en direct — metropole.toulouse.fr",
  schoolTerm: "Période scolaire",
  schoolHolidays: "Vacances scolaires",
  specialPeriods: "Périodes particulières",
  hoursLabel: "Horaires :",
  noHours: "Horaires non renseignés — vérifiez sur le site officiel.",
  priceLabel: "Tarif :",
  paidEntry: "Entrée payante",
  freeEntry: "Accès gratuit",
  directions: "Itinéraire ↗",
  website: "Site web ↗",
  searchWebsite: "Rechercher le site ↗",

  footerData: "Données :",
  footerLicenceFR: "(licence ouverte)",
  footerLicenceGB: "(licence OGL v3)",
  footerOsm: "© les contributeurs d'OpenStreetMap",
  footerDisclaimer:
    "Horaires et tarifs issus d'OpenStreetMap : disponibles pour une partie des piscines " +
    "seulement — vérifiez sur le site officiel avant de vous déplacer.",

  coveredLabel: "Pays couverts :",
  countryNames: { fr: "France", gb: "Angleterre", de: "Allemagne" },
};

const en: Dict = {
  metaTitle: "Swimspot — find a swimming pool near you",
  metaDescription:
    "Every public swimming pool around you, in France and England: pick a radius, " +
    "see pools, opening hours and prices where known, with a map and directions.",
  subtitle:
    "Find the public swimming pools around you: basins, opening hours and prices where known.",

  searchPlaceholder: "Address, town, postcode…",
  searchAria: "Search for an address",
  locateButton: "📍 Around me",
  locating: "Locating…",
  errNoGeolocation: "Geolocation is not available on this device.",
  errGeoDenied: "Location denied or unavailable — search for an address instead.",
  errSearchDown: "Address search is unavailable right now.",

  savedAddressesAria: "Saved addresses",
  saveAddress: "☆ Save",
  removeAddress: (label) => `Remove address ${label}`,

  radiusLabel: "Radius:",
  radiusAria: "Search radius",
  typeLabel: "Type:",
  typeAria: "Pool type",
  typeAll: "All",
  typeIndoor: "Indoor",
  typeOutdoor: "Outdoor",
  openLabel: "Open:",
  openAria: "Opening",
  openTitle: "Based on known opening hours (only part of the pools)",
  openAll: "Any",
  openNow: "Now",
  openToday: "Today",
  favLabel: "Favourites:",
  favAria: "Favourites",
  favAll: "All",
  favOnly: "★ Only",
  lenLabel: "Length:",
  lenAria: "Pool length",
  lenAll: "Any length",

  loadError: "Could not load the pool list. Please reload the page.",
  emptyTitle: "Where are you looking for a pool?",
  emptyHint: "Tap “📍 Around me” or type an address above.",
  referenced: (n) => `${n} public pools listed.`,
  loadingPools: "Loading pools…",
  noneInRadius: "No pool within this radius — try a larger one.",
  noneFavorite: "No favourite pool within this radius — tap ☆ on a pool to add it.",
  countLine: (n, radiusKm, label) =>
    `${n} pool${n > 1 ? "s" : ""} within ${radiusKm} km of ${label} (straight line).`,
  showMore: (n) => `Show more (${n} left)`,
  mapAria: "Pool map",

  distanceTitle: "Straight-line distance",
  favAdd: (name) => `Add ${name} to favourites`,
  favRemove: (name) => `Remove ${name} from favourites`,
  envLabels: { int: "Indoor", ext: "Outdoor", mix: "Indoor + outdoor" },
  basinLabels: {
    sportif: "lap pool",
    ludique: "leisure pool",
    mixte: "mixed pool",
    toboggan: "splash pool",
    plongeon: "diving pit",
    plongée: "scuba pit",
    principal: "main pool",
    apprentissage: "learner pool",
    lido: "lido",
  },
  basinFallback: (label) => `${label} pool`,

  seasonalClosed: "Seasonally closed at the moment",
  badgeOpenNow: "Open now",
  badgeClosedNow: "Closed now",
  badgeClosedToday: "Closed today",
  todayLabel: "Today:",
  liveSource: "Live daily status — metropole.toulouse.fr",
  schoolTerm: "School term",
  schoolHolidays: "School holidays",
  specialPeriods: "Special periods",
  hoursLabel: "Opening hours:",
  noHours: "Opening hours unknown — check the official website.",
  priceLabel: "Price:",
  paidEntry: "Paid entry",
  freeEntry: "Free entry",
  directions: "Directions ↗",
  website: "Website ↗",
  searchWebsite: "Search the website ↗",

  footerData: "Data:",
  footerLicenceFR: "(open licence)",
  footerLicenceGB: "(OGL v3 licence)",
  footerOsm: "© OpenStreetMap contributors",
  footerDisclaimer:
    "Opening hours and prices come from OpenStreetMap and are only available for part of " +
    "the pools — check the official website before travelling.",

  coveredLabel: "Countries covered:",
  countryNames: { fr: "France", gb: "England", de: "Germany" },
};

const DICTS: Record<Locale, Dict> = { fr, en };

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}
