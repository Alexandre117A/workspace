# Guide développeur

## Lancer
Le plus simple : double-cliquer sur `Lancer GEONEX.bat` (ou `npm start`). Au premier démarrage il installe les dépendances, crée l'environnement Python du moteur (installe Python 3.13 via winget s'il manque), compile l'API, construit l'application web, puis ouvre http://localhost:4000. `--rebuild` reconstruit le client web.

Mode développement (rechargement à chaud du client) :
```
npm run dev:engine     # moteur   http://127.0.0.1:8100
npm run dev:api        # API      http://localhost:4000/api
npm run dev:client     # client   http://localhost:8081  (parle à l'API sur le port 4000)
```
Sur un téléphone, ouvrir `http://<IP de l'ordinateur>:4000` (même Wi-Fi) ; le pare-feu Windows peut demander d'autoriser Node.

## Structure
- `services/engine` — moteur Python/FastAPI (`geonex_engine/`), tests dans `tests/`.
- `services/api` — NestJS : `game.service.ts` (phases, chronomètres, Assemblée, Diplomatie, arbitrage, Rome), `game.gateway.ts` (Socket.IO), `sessions.ts`, `scenarios.ts`, `archives.ts`, `auth.ts`, `db.ts` + `migrations/` (SQL versionné).
- `apps/client` — Expo Router (`src/app`), composants de jeu dans `src/components/game`.
- `packages/shared` — types, constantes et schémas zod partagés.
- `scripts/` — lanceur, outil de participants de test, génération du son d'alerte.

## Tests
```
npm run test:engine    # pytest (règles, scénarios, confidentialité, API du moteur)
npm run test:api       # parcours multijoueur complet avec le moteur réel (chronomètres ×0,05)
npm run typecheck:client
```

## Participants de test (mode démonstration, développement uniquement)
`node scripts/demo-bots.mjs join <CODE> 2` fait rejoindre deux équipes automatisées à une session ouverte ; `host "Crise Chine–Taïwan" 3 2` crée une session, un Président de test et deux équipes. Ces bots utilisent l'API publique comme des joueurs : ils ne remplacent aucune intégration réelle.

## Principes à conserver
- Le serveur est l'autorité : chronomètres, ressources, droits. Le client n'envoie que des intentions.
- Les vues (`views.py`) sont filtrées côté moteur : un secret absent de la vue n'est jamais envoyé.
- Toute modification d'état passe par `effects.py` ; tout tirage par `probability.py` (graine + clé → reproductible, audité).
- Une sortie d'IA est validée par schéma puis contrainte par le moteur ; sans IA, le moteur le signale (`generation.provider`).
- Migrations : ajouter un fichier `00NN_*.sql`, ne jamais modifier une migration appliquée.

## Variables d'environnement
Voir `.env.example`. Le lanceur lit `.env` à la racine.
