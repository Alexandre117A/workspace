# Déploiement et publication

## Hébergement gratuit permanent (PC éteint) — Render + Neon

GEONEX tourne alors sur Internet sans votre ordinateur. Tout est gratuit, **sans carte bancaire**, et se fait avec votre compte GitHub.

| Rôle | Service | Fichier du dépôt |
|---|---|---|
| Moteur + API temps réel + site web (un seul conteneur) | **Render** (offre gratuite) | `render.yaml`, `Dockerfile`, `scripts/serve.mjs` |
| Base de données (comptes, parties, archives) | **Neon** PostgreSQL (offre gratuite) | variable `DATABASE_URL` |
| Maintien en éveil | GitHub Actions (gratuit sur dépôt public) | `.github/workflows/keepalive.yml` |

Pourquoi une base externe : le disque d'un service gratuit Render est **effacé à chaque redémarrage**. Sans PostgreSQL externe, comptes et parties disparaîtraient.

### Étapes (une dizaine de minutes)
1. **Neon** — https://neon.com › *Sign up* avec GitHub › *Create project* (région Europe, ex. Frankfurt). Sur le tableau de bord, bouton *Connect* : copiez la **connection string** (`postgresql://…`). Gardez-la pour l'étape 3 ; ne la collez nulle part ailleurs (c'est un mot de passe).
2. **Render** — https://render.com › *Sign up* avec GitHub › *New* › **Blueprint** › autorisez l'accès au dépôt › choisissez-le › Render lit `render.yaml`.
3. Render demande les variables marquées « à saisir » : **`DATABASE_URL`** = la chaîne Neon ; `GEONEX_OWNER_EMAILS` = votre e-mail de compte GEONEX (donne le rôle propriétaire) ; `GEONEX_RESEARCH_CONTACT` = e-mail ou URL de contact (exigé par Wikipédia pour les recherches ; facultatif). Les secrets `GEONEX_JWT_SECRET` et `GEONEX_ENGINE_TOKEN` sont générés automatiquement. Cliquez *Apply*.
4. Attendez la fin de la construction (≈ 5 à 10 min la première fois). L'adresse publique est de la forme `https://geonex-xxxx.onrender.com`.
5. Vérifiez : `node scripts/smoke.mjs https://geonex-xxxx.onrender.com` (santé, site, compte invité, préparation d'une simulation, session, WebSocket).
6. **Éveil permanent** — dépôt GitHub › *Settings › Secrets and variables › Actions › Variables › New repository variable* : `GEONEX_PUBLIC_URL` = l'adresse Render (sans « / » final). La tâche `keepalive.yml` la sollicite toutes les 10 minutes.
7. (Facultatif) Même endroit, variable `GEONEX_API_URL` = la même adresse : le site GitHub Pages (`https://<compte>.github.io/<dépôt>/`) parlera alors à ce serveur et deviendra jouable.

### Ce que l'offre gratuite implique (à savoir)
- **Mise en veille** : Render endort un service gratuit après 15 minutes sans visite ; le réveil prend environ une minute. La tâche d'éveil l'évite presque toujours, mais GitHub exécute les tâches planifiées « au mieux » (retards possibles) et les **désactive après 60 jours sans activité** dans le dépôt : un envoi de code ou un clic sur *Run workflow* les relance.
- **Quota** : 750 heures d'instance par mois et par compte Render, soit le mois entier pour un seul service. Aucun autre service gratuit dans le même compte ne doit tourner en continu.
- **Mémoire** : 512 Mo. Mesuré en local : ≈ 140 Mo au repos. Une instance unique (pas de répartition de charge) : un service gratuit ne peut pas être dupliqué.
- **Redémarrages** : Render redémarre régulièrement les services gratuits. Comptes, scénarios, sessions et archives sont dans PostgreSQL ; au redémarrage, les parties en cours sont restaurées depuis leur dernier état et leurs chronomètres reprennent sur leurs échéances d'origine (le temps passé à l'arrêt compte). Une préparation de simulation interrompue par un redémarrage est à relancer. La reprise d'une partie en cours après redémarrage n'a pas été rejouée sur PostgreSQL ici (seul le retour des sessions en salle d'attente l'a été).
- **Protection** : l'API limite le débit par adresse IP (60 créations de comptes/min, 40 créations de sessions/min, 1500 requêtes/min) et refuse l'ancien secret par défaut (`GEONEX_JWT_SECRET` obligatoire en production).
- **Données** : la base Neon gratuite est limitée (0,5 Go) ; c'est largement suffisant pour des milliers de parties de texte.
- **Pas d'IA, pas de voix, pas de publicité** : tout est déjà désactivé par défaut.

### Ce qui a été vérifié, et ce qui ne l'a pas été
Vérifié ici : API + moteur + site en conditions de production (`NODE_ENV=production`, `scripts/serve.mjs`) sur un **vrai PostgreSQL 18**, avec les deux tests d'intégration complets, le contrôle `scripts/smoke.mjs`, la limite de débit, la navigation directe (SPA) et le redémarrage à froid (les comptes, scénarios et sessions survivent). Les dépendances de production de l'API ont été installées seules, comme dans l'image.
**Déploiement réel (30 octobre 2026)** : l'image Docker a été construite par Render du premier coup, le service est en ligne sur https://geonex.onrender.com et `node scripts/smoke.mjs https://geonex.onrender.com` passe entièrement (API, moteur, site, navigation directe, compte invité, préparation d'une simulation, création de session, WebSocket) avec la base Neon en connexion chiffrée.
**Non vérifié** : le réveil après mise en veille (délai réel), le comportement sous charge, et la reprise d'une partie en cours après un redémarrage de Render.

---

# Autres options et référence

Rien d'autre n'est déployé ni publié. Architecture générale :

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
