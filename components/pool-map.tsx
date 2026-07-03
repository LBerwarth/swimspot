"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PoolWithDistance } from "@/lib/types";
import { formatDistance } from "@/lib/geo";

interface Props {
  center: [number, number];
  radiusKm: number;
  pools: PoolWithDistance[];
  /** Clic sur le point d'une piscine : cible sa fiche dans la liste. */
  onSelect?: (poolId: string) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const USER_ICON = () =>
  L.divIcon({
    className: "",
    html: '<div style="width:16px;height:16px;border-radius:9999px;background:#7c3aed;border:3px solid white;box-shadow:0 0 0 2px #7c3aed"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const POOL_ICON = () =>
  L.divIcon({
    className: "",
    html: '<div style="width:14px;height:14px;border-radius:9999px;background:#d946ef;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

export function PoolMap({ center, radiusKm, pools, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    // Définit la vue (y compris la toute première : tant que la carte n'a pas
    // de vue, Leaflet diffère l'ajout réel des couches et circle.getBounds()
    // planterait). Les limites sont donc calculées sans passer par la couche.
    map.fitBounds(L.latLng(center).toBounds(radiusKm * 2000), {
      padding: [16, 16],
    });

    const circle = L.circle(center, {
      radius: radiusKm * 1000,
      color: "#a21caf",
      weight: 1.5,
      fillColor: "#e879f9",
      fillOpacity: 0.08,
    });
    layer.addLayer(circle);
    layer.addLayer(L.marker(center, { icon: USER_ICON() }));

    for (const pool of pools) {
      const marker = L.marker([pool.lat, pool.lon], { icon: POOL_ICON() });
      marker.bindPopup(
        `<strong>${escapeHtml(pool.name)}</strong><br>` +
          `${escapeHtml(pool.city)} · ${formatDistance(pool.distanceKm)}`,
      );
      if (onSelect) marker.on("click", () => onSelect(pool.id));
      layer.addLayer(marker);
    }
  }, [center, radiusKm, pools, onSelect]);

  return (
    <div
      ref={containerRef}
      className="h-72 w-full rounded-2xl border border-fuchsia-200 shadow-sm"
      aria-label="Carte des piscines"
    />
  );
}

export default PoolMap;
