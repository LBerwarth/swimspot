# Étude : étendre Piscines de France à l'Europe

*Étude du 3 juillet 2026. Sources vérifiées ce jour ; chiffres OSM mesurés via
Overpass (voir tableau).*

## 1. Ce qui se généralise tel quel

L'architecture actuelle est déjà prête pour l'Europe sur plusieurs points :

- **Schéma de données** : le champ `country` existe depuis le premier commit ;
  `lens[]`, `env`, `basins`, `hours` (format OSM `opening_hours`, standard
  mondial) sont indépendants du pays.
- **Pipeline** : `build-data.mts` = « source officielle + enrichissement OSM
  par proximité (300 m) » — le motif se transpose à chaque pays, seule la
  « source officielle » change.
- **Parseur d'horaires** : le format `opening_hours` d'OSM est identique
  partout (les règles `SH` signifient « vacances scolaires » dans tous les
  pays — le calendrier diffère, pas la syntaxe).
- **Carte** : Leaflet + tuiles OSM couvrent le monde.
- **Filtres, favoris, rayon** : aucun changement.

## 2. Ce qui doit changer

| Composant | Aujourd'hui (France) | Europe |
|---|---|---|
| Base piscines | Data ES (ministère des Sports) | Une source par pays (voir § 3), repli OSM |
| Géocodage / autocomplétion | api-adresse.data.gouv.fr (France seule) | **Photon** (photon.komoot.io, base OSM, autocomplétion autorisée, gratuit) ou Nominatim auto-hébergé |
| Langue de l'interface | Français uniquement | i18n nécessaire (au minimum EN + langue locale) |
| Statut live | Overlay toulouse-piscines | Concept extensible ville par ville, pays par pays |
| Jeu de données | 1 fichier, 0,8 Mo, 3 294 piscines | ~25–40 000 piscines ; découpage **par pays** (chargement à la demande selon la position) |

## 3. Sources officielles par pays (vérifiées le 3 juillet 2026)

Le constat clé : **il n'existe aucune source européenne unifiée**, mais
plusieurs pays ont un équivalent — parfois meilleur — de Data ES.

| Pays | Source | Qualité | Licence |
|---|---|---|---|
| 🇬🇧 Angleterre | [Active Places (Sport England)](https://www.activeplacespower.com/pages/downloads) | ★★★ ~115 000 équipements, 200+ attributs, **mise à jour quotidienne**, CSV/JSON/GeoJSON | OGL v3 (libre) |
| 🇩🇪 Allemagne | [Bäderleben](https://baederleben.de) (BISp) | ★★★ **spécialisée piscines** : 9 300+ bäder, 140 attributs **dont tarifs d'entrée**, export CSV | Open science |
| 🇳🇱 Pays-Bas | [Database SportAccommodaties](https://www.mulierinstituut.nl/programmas-aanbod/database-sportaccommodaties-dsa/) (Mulier Instituut) | ★★☆ ~22 000 équipements, ~1 900 piscines | CC-BY-SA 4.0 |
| 🇧🇪 Flandre | [Sportinfrastructuur Vlaanderen](https://data.gov.be/nl/dataset/6e1686a2-4c8c-4a30-93da-0bff7cae21b6) (POI service) | ★★☆ mise à jour trimestrielle ; Wallonie/Bruxelles à part | Ouverte |
| 🇮🇹 Italie | [Banca Dati Impianti Sportivi](https://dbimpiantisportivi.sportesalute.eu/) (Sport e Salute) | ★☆☆ recensement national en cours de reconstruction (2024–), open data partiel | Partielle |
| 🇪🇸 Espagne | [CNID](https://www.csd.gob.es/en/csd/facilities/national-census-sports-facilities) + portails régionaux | ★☆☆ dernier censo national : **2010** ; données régionales fragmentées (Andalucía, CyL…) | Variable |
| Autres | — | OSM seul en repli | ODbL |

Remarque : l'Allemagne (Bäderleben) est le seul pays trouvé avec des **tarifs**
dans la source officielle — mieux que la France.

## 4. Couverture OSM par pays (mesurée le 3 juillet 2026)

Requête : `leisure=sports_centre` + `sport~swimming` par pays, et part avec
`opening_hours`. Référence France : 2 840 équipements, 12 % avec horaires.

| Pays | Équipements OSM | Avec horaires |
|---|---|---|
| (mesures en cours — tableau complété ci-dessous) | | |

## 5. Architecture cible

```
scripts/
  build-data.mts            → orchestrateur : un module par pays
  sources/fr-dataes.mts     → France (existant)
  sources/gb-activeplaces.mts
  sources/de-baederleben.mts
  sources/osm-fallback.mts  → tous les autres pays (OSM seul)
public/data/
  piscines-fr.json          → un fichier par pays (~0,3–1,5 Mo chacun)
  piscines-de.json …
  index.json                → liste des pays + bbox + compte
```

- Le client charge `index.json`, détermine le pays via la position ou
  l'adresse choisie (Photon renvoie le code pays), puis charge le(s)
  fichier(s) pays utile(s) — y compris les voisins en zone frontalière
  (Strasbourg → fr + de).
- Le géocodage passe à **Photon** (autocomplétion multilingue, code pays dans
  la réponse). L'API adresse française peut rester en priorité quand la saisie
  est en France (meilleure qualité sur les adresses françaises).
- i18n : `next-intl` ou équivalent ; libellés courts (chips, badges), volume
  de traduction faible. Détection par `Accept-Language`.
- Les overlays live restent des modules optionnels par ville/pays (le motif
  toulouse-piscines : une URL, un mapping id → statut du jour).

## 6. Plan par phases

1. **Phase 0 — préparation (petite)** : découpage par pays du pipeline et du
   chargement client, bascule géocodage Photon, i18n minimale FR/EN. L'app
   reste 100 % France fonctionnellement.
2. **Phase 1 — pays « faciles » à source riche** : Angleterre (Active Places)
   puis Allemagne (Bäderleben, avec tarifs !). Gros gain, effort modéré :
   écrire deux modules source + traductions EN/DE.
3. **Phase 2 — pays à source moyenne** : Pays-Bas, Flandre. Même motif.
4. **Phase 3 — reste de l'Europe en OSM seul** : couverture inégale mais
   honnête (l'interface assume déjà « non renseigné »). Italie/Espagne
   basculeront vers leur source nationale quand elle mûrira.

## 7. Risques et points d'attention

- **Licences** : ODbL (OSM) et CC-BY-SA (NL) sont « share-alike » — le jeu de
  données fusionné doit rester publié sous licence compatible et attribuer
  chaque source par pays (le footer actuel le fait déjà pour deux sources).
- **Volume** : ~30 000+ piscines en Europe ; le découpage par pays maintient
  chaque fichier sous ~1,5 Mo. Pas de base de données nécessaire.
- **Qualité hétérogène** : afficher le niveau de couverture par pays (« les
  horaires sont connus pour X % des piscines de ce pays ») pour cadrer les
  attentes.
- **Vacances scolaires** : les règles `SH` s'affichent déjà sans calcul de
  période ; les interpréter par pays (calendriers scolaires) est une
  amélioration ultérieure, pas un prérequis.
- **Serveurs publics** (Photon, tuiles OSM) : usage personnel OK ; à fort
  trafic, prévoir auto-hébergement ou fournisseur payant.
