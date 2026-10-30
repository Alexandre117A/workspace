# Atlas stratégique : identité visuelle et interface de simulation

Mis à jour le 30 octobre 2026 (branche `v2`). La v1 reste sauvegardée (`docs/VERSIONS.md`).

## Principe
L'interface décide **quoi** afficher à partir de l'état réel de la partie, et **comment** à partir de l'époque du scénario.
Rien n'est inventé : une donnée absente est signalée « indisponible », jamais remplacée par un chiffre.

## Où est quoi
| Sujet | Fichier |
|---|---|
| Palette officielle (9 couleurs) et tokens | `apps/client/src/theme.ts` (`A` = palette de référence, `C` = tokens d'interface) |
| Politique de fond de carte, étiquettes d'époque, style cartographique | `services/engine/geonex_engine/atlas.py` (testée : `tests/test_atlas.py`) |
| Fiches de scénarios de l'accueil | `services/engine/geonex_engine/catalog.py` → `GET /api/catalog` |
| Contexte stratégique du client (identité, géographie, acteurs, zones, relations, couches) | `apps/client/src/atlas/context.ts` |
| Matières par époque (papier, mer, côtes, encre) | `apps/client/src/atlas/styles.ts` |
| Provenance des valeurs (attesté / estimation / hypothèse / fictif / simulation / indisponible) | `apps/client/src/atlas/provenance.ts` |
| Carte interactive (zoom, déplacement, couches, détail) | `apps/client/src/atlas/StrategicMap.tsx` |
| Synthèse « Strategic Intelligence », indicateurs, chronologie | `apps/client/src/atlas/panels.tsx` |
| Bandeau de contexte, poste d'équipe, tableau du Président | `apps/client/src/atlas/AtlasWorkspace.tsx` |
| Accueil : hero, cartes de modes illustrées, scénarios, rejoindre | `apps/client/src/atlas/home/*`, `apps/client/src/app/index.tsx` |

## Règle d'honnêteté des cartes
Les frontières Natural Earth sont **actuelles**. Le moteur choisit donc le fond (`theatre.basemap`) :
`borders` (contemporain, guerre froide : frontières actuelles, avertissement conservé), `land` (avant : côtes seules, note
« les frontières de l'époque ne sont pas représentées »), `schematic` (mondes inventés : carte schématique signalée).
Aucun jeu de frontières d'époque n'est livré (les données libres existantes sont sous licence GPL ou incomplètes).

## Confidentialité
Le contrôle des zones (`zones_control`) n'est transmis qu'au Président. L'équipe voit ses propres relations, le public voit
guerres et escalades connues. Le catalogue ne contient ni objectifs, ni secrets, ni lignes rouges (test d'API).

## Ajouter…
- **un scénario à l'accueil** : une ligne dans `ENTRIES` (`catalog.py`) ; la fiche, sa vignette cartographique et son bouton
  sont produits à partir des métadonnées du scénario généré. Une base historique se déclare dans `seeds_historical.py`.
- **une époque** : une entrée dans `ERA_LABELS` / `ATLAS_STYLES` (`atlas.py`) et, si besoin, une matière dans `styles.ts`.
- **une couche de carte** : une définition dans `buildAtlasContext` (elle n'apparaît que si la donnée existe), un dessin dans `StrategicMap`.
- **un indicateur** : un onglet de `IndicatorsPanel` ou une entrée de `keyIndicators`, avec sa provenance.

## Images
Fond de la Chronique : photographies d'archives et **cartes anciennes** libres de droits (`npm run photos -- 3 theme=cartes`,
puis `npm run photos:shrink`), crédits dans l'application et `docs/CREDITS.md`. Grain de papier : `npm run atlas:assets`.

## Limites connues
- Pas de frontières d'époque ni de cartes historiques géoréférencées : fond neutre (côtes) avant la guerre froide.
- Les indicateurs sont ceux du moteur (capitaux, stabilité, tensions, relations) : pas de PIB ni d'effectifs détaillés par période.
- Les scénarios des exemples de la demande (Napoléon 1812, Europe 1936) n'existent pas dans le moteur : non présentés comme jouables.
- Cartes de modes et fiches : un contenu décoratif construit à partir de données réelles ; les marqueurs du hero sont éditoriaux (repères géographiques, pas des données de partie).
- Vérifié dans un navigateur à 375, 640 et 751 px ; la disposition ≥ 1100 px est contrôlée par mesure (le panneau d'aperçu ne l'affiche pas en entier). Non vérifié sur iPhone/iPad.
