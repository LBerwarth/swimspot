const EARTH_RADIUS_KM = 6371;

/** Distance en kilomètres entre deux points GPS (formule de haversine). */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** « 850 m », « 3,2 km » (fr) / « 3.2 km » (en), « 12 km ». */
export function formatDistance(km: number, locale: string = "fr"): string {
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} m`;
  if (km < 10) {
    const value = km.toFixed(1);
    return `${locale === "fr" ? value.replace(".", ",") : value} km`;
  }
  return `${Math.round(km)} km`;
}
