# Piscines de France

Trouvez les piscines publiques autour de vous, partout en France : choisissez un
rayon (1 à 50 km), voyez les bassins, les horaires et tarifs quand ils sont
connus, sur carte et en liste.

Application sœur de [toulouse-piscines](https://toulouse-piscines.vercel.app/),
étendue à toute la France.

## Données

Un fichier statique par pays (`public/data/piscines-<cc>.json` + `index.json`)
est généré par `npm run build:data` (orchestrateur multi-pays, un module par
source dans `scripts/sources/`). Le client charge l'index puis les fichiers
des pays couvrant la position choisie.

- **France** — Data ES + OSM (détails ci-dessous) : ~3 300 piscines.
- **Angleterre** — [Active Places](https://www.activeplacespower.com)
  (Sport England, licence OGL v3, API ArcGIS publique) : ~1 700 piscines
  réellement ouvertes au public (« Pay and Play » et clubs communautaires ;
  spas d'hôtels et clubs à adhésion écartés), avec longueurs de bassins et
  sites web. Enrichissement OSM identique à la France.

Sources France :

- **[Data ES](https://equipements.sports.gouv.fr)** (ministère des Sports,
  licence ouverte) — recensement officiel des équipements sportifs. Base de
  référence : ~3 300 piscines, avec nom, adresse, commune, coordonnées GPS et
  types de bassins. Les installations réservées (établissements scolaires,
  militaires, médicaux, hébergements touristiques…) sont écartées d'après leur
  nom — le drapeau « ouvert au public » de Data ES est trop peu fiable.
- **[OpenStreetMap](https://www.openstreetmap.org/copyright)** (ODbL) —
  enrichissement par correspondance géographique (< 300 m) : horaires
  (`opening_hours`), tarif (`charge`/`fee`), site web, téléphone.

Couverture réelle de l'enrichissement (juillet 2026) : horaires ~12 % des
piscines, tarifs ~2 %, site web ~20 %. C'est l'état de l'open data français —
l'interface l'assume en affichant « non renseigné » et un lien vers le site
officiel plutôt qu'une information inventée.

**Superposition live Toulouse** : les piscines toulousaines reçoivent leur
statut du jour réel (fermetures estivales et exceptionnelles comprises) depuis
l'API `/api/status` de toulouse-piscines, qui analyse le site de la métropole
toutes les ~30 min. Ce statut prime sur les horaires OSM (badge, filtres
« ouvertes », créneaux du jour). En dev, pointez
`NEXT_PUBLIC_TOULOUSE_STATUS_URL` vers `http://localhost:3001/api/status`.

Le champ `country` du schéma prépare une éventuelle extension européenne
(OSM couvre l'Europe ; il faudrait remplacer Data ES et l'API adresse par des
équivalents par pays).

## Développement

```bash
npm install
npm run dev          # http://localhost:3002
npm test             # tests du parseur d'horaires
npm run build:data   # régénère public/data/piscines.json (sources en ligne)
```

`build:data` accepte des fichiers locaux pour éviter de retélécharger :
`npm run build:data -- --dataes bassins.json --osm osm.json`.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Leaflet ·
géocodage par [api-adresse.data.gouv.fr](https://adresse.data.gouv.fr/api-doc/adresse).
Distances à vol d'oiseau partout (les distances routières OSRM, essayées puis
retirées, se sont révélées peu intuitives face au cercle de la carte).
