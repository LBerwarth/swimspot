import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // CDN : cache une heure. Navigateur : revalide à chaque chargement
        // (réponse 304 via ETag), sinon un jeu de données régénéré resterait
        // invisible jusqu'à une heure.
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
