# GEONEX

Simulations géopolitiques multijoueurs (iPhone, iPad, web, ordinateur). Projet autonome, indépendant du site Géopolis.

## Architecture
- `services/engine` — moteur de simulation (Python/FastAPI) : état du monde, probabilités auditables, scénarios, acteurs non joués, engagements, renseignement, cartes, Communiqués de Rome, classement, archives, vues filtrées.
- `services/api` — backend (NestJS) : comptes, sessions, lobby, orchestration temps réel (Socket.IO), arbitrage, persistance PostgreSQL (`pg`) ou PGlite embarqué en local.
- `apps/client` — client Expo/React Native (web + mobile).
- `packages/shared` — types et schémas partagés.

## Démarrage local (Windows)
```
npm install
npm run setup:engine        # crée le venv Python (ou GEONEX_PYTHON=...)
npm run dev:engine          # moteur  http://127.0.0.1:8100
npm run dev:api             # API     http://localhost:4000/api
npm run dev:client          # web     http://localhost:8081
```
Participants de test (mode démonstration, outil de développement) : `node scripts/demo-bots.mjs join <code> 2` ou `host "<prompt>" <équipes> [bots]`.

## Tests
`npm run test:engine` (51 tests pytest) · `npm run test:api` (parcours multijoueur complet avec le moteur réel).

## Configuration externe (non incluse)
- `ANTHROPIC_API_KEY` : active l'IA (scénarios libres, questions adaptatives, rédaction). Sans clé : règles du moteur, signalées comme telles.
- `GEONEX_RESEARCH_CONTACT` : contact exigé par Wikimedia (sinon Wikipédia renvoie 403 ; Wikidata fonctionne).
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` : voix (jetons serveur prêts ; client audio non intégré → canal texte).
- `DATABASE_URL` (PostgreSQL), `GEONEX_JWT_SECRET`, `GEONEX_OWNER_EMAILS` pour la production.

## État d'avancement
Voir le rapport de fin de session. Points connus à reprendre : intégration client audio LiveKit, transcription vocale, doublon d'affichage « succès » dans le rapport de round, sélection Wikidata (rang préféré), dédoublonnage des décisions des acteurs non joués, configuration EAS/App Store, documentation de déploiement détaillée.
