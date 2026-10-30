# Déploiement et publication

Rien n'est déployé ni publié : aucun compte, service payant ou dépôt distant n'a été créé. Ce document décrit ce qui reste à faire, et ce que cela demande.

## Architecture à héberger
| Composant | Rôle | Fichier |
|---|---|---|
| API + application web | Comptes, sessions, temps réel, sert le client web | `Dockerfile` |
| Moteur | Simulation (Python) — jamais exposé au public | `services/engine/Dockerfile` |
| PostgreSQL | Données persistantes | service managé ou `docker-compose.yml` |
| LiveKit (facultatif) | Voix | LiveKit Cloud ou auto-hébergé |

L'API ouvre des WebSockets (Socket.IO) et garde les chronomètres en mémoire : **une seule instance d'API** (pas de répartition de charge sur plusieurs instances) tant que le temps réel n'est pas externalisé (Redis). Le moteur doit être joignable par l'API uniquement (réseau privé + `GEONEX_ENGINE_TOKEN`).

## Variables d'environnement (production)
`DATABASE_URL`, `GEONEX_JWT_SECRET` (obligatoire), `GEONEX_ENGINE_URL`, `GEONEX_ENGINE_TOKEN`, `GEONEX_OWNER_EMAILS`, `GEONEX_CORS_ORIGINS` (si le client est hébergé ailleurs), `ANTHROPIC_API_KEY`, `GEONEX_AI_BUDGET_USD`, `GEONEX_RESEARCH_CONTACT`, `LIVEKIT_*`. Voir `.env.example`.

## Étapes (à faire avec votre accord et vos comptes)
1. Choisir un hébergeur (conteneurs avec WebSocket + PostgreSQL managé). Créer le compte vous-même.
2. Construire les deux images, définir les variables, démarrer. `docker-compose.yml` donne la pile de référence.
3. Vérifier `GET /api/health` (état du moteur) et `GET /api/config` (fonctionnalités réellement actives).
4. Placer le tout derrière HTTPS (obligatoire pour le micro dans les navigateurs).

## Application mobile (App Store)
Prérequis qui ne dépendent pas de moi : compte Apple Developer payant, identifiants App Store Connect, politique de confidentialité publiée (voir `docs/CONFIDENTIALITE.md`), captures d'écran et fiche.
- Identifiant d'application prévu : `app.geonex.mobile` (`apps/client/app.json`) — à remplacer par un identifiant que vous possédez.
- Profils de build : `apps/client/eas.json`. Remplacer `EXPO_PUBLIC_API_URL` par l'adresse HTTPS de l'API.
- `eas build --platform ios --profile production` puis `eas submit` (commandes EAS, compte Expo requis).
- L'audio natif (LiveKit React Native) exige une build de développement : voir `docs/ETAT.md`.
- **Aucune publication n'a eu lieu.**

## Ordinateur (Windows/macOS)
La version web fonctionne dans un navigateur. Un logiciel installable peut être produit plus tard en encapsulant cette version (Electron/Tauri) sans réécrire le client.
