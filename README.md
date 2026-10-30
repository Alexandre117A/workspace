# GEONEX

Simulations géopolitiques multijoueurs (web, iPhone, iPad, ordinateur) : crises contemporaines, événements historiques ou univers fictifs, avec un moteur de simulation qui fait évoluer un monde cohérent selon les décisions des équipes.

Projet autonome, indépendant du site Géopolis.

## Utiliser GEONEX
Double-cliquez sur **`Lancer GEONEX.bat`** (ou `npm start`). Le navigateur s'ouvre sur http://localhost:4000. Les autres participants ouvrent l'adresse « autres appareils » affichée dans la fenêtre (même Wi-Fi) et saisissent le code de la session.

Aucune clé n'est obligatoire. L'IA, la voix et la recherche en ligne sont facultatives : voir `.env.example`.

## Documentation
- `docs/ETAT.md` — ce qui est terminé, partiel, testé ou externe
- `docs/DEVELOPPEMENT.md` — structure, commandes, tests
- `docs/DEPLOIEMENT.md` — hébergement, App Store, ordinateur
- `docs/CONFIDENTIALITE.md` — projet de politique de confidentialité

## Architecture
`services/engine` (Python/FastAPI) · `services/api` (NestJS, Socket.IO, PostgreSQL ou PGlite) · `apps/client` (Expo/React Native) · `packages/shared` (types partagés).
