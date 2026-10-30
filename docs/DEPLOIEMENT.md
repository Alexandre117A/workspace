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

## Aperçu en ligne de la v2 (second service gratuit, à côté de la version stable)

Objectif : voir et faire essayer la refonte « Atlas stratégique » en ligne **sans toucher à la version stable** (`geonex`, branche `main`).
Le second service s'appelle `geonex-v2`, suit la branche `v2` et se met à jour à chaque envoi sur `v2`. Il affiche un bandeau « Version d'essai »
avec un lien vers la version stable. Définition : `render.preview.yaml`.

### Étapes (une dizaine de minutes, avec vos comptes)
1. **Base séparée (recommandé)** : Neon → votre projet → *Branches* → *Create branch* (nom `apercu-v2`, depuis `main`) → *Connect* → copiez la
   chaîne de connexion **directe** (pas « pooled »), avec `sslmode=require&channel_binding=require`. Sans cela, l'essai partagerait les comptes
   et les parties de la version stable.
2. **Render** → *New* → *Blueprint* → dépôt `Alexandre117A/workspace` → branche **`v2`** → chemin du fichier **`render.preview.yaml`**.
   Si Render ne propose pas de chemin personnalisé : *New* → *Web Service* → même dépôt, branche `v2`, *Runtime* Docker, région Frankfurt, offre
   *Free*, *Health Check Path* `/api/health`, puis les variables du fichier `render.preview.yaml` (`NODE_ENV=production`, `GEONEX_PREVIEW=true`,
   `GEONEX_STABLE_URL=https://geonex.onrender.com`, `GEONEX_JWT_SECRET` et `GEONEX_ENGINE_TOKEN` = deux longues valeurs aléatoires distinctes).
3. Renseignez `DATABASE_URL` (étape 1) ; laissez `GEONEX_OWNER_EMAILS` et `GEONEX_RESEARCH_CONTACT` vides ou copiez ceux de la version stable ; *Apply*.
4. Contrôle une fois en ligne (la première construction prend 5 à 10 minutes) :
   ```bash
   node scripts/smoke.mjs https://geonex-v2.onrender.com
   ```
   (adresse exacte affichée par Render). Le script crée un compte invité et une session de test.

### Ce que ce second service implique
- **Heures gratuites partagées** : Render offre 750 heures d'instance par mois **pour tout l'espace de travail**, pas par service. Un service gratuit
  gardé éveillé 24 h/24 (c'est le rôle de `keepalive.yml` pour la version stable) en consomme 720 à 744. L'aperçu s'endort après 15 minutes sans
  visite et ne consomme que le temps où il est éveillé, mais **la marge est de 6 à 30 heures par mois** : au-delà, Render suspend les services gratuits
  jusqu'au mois suivant. Pendant l'essai, soit supprimez l'aperçu dès que vous avez décidé, soit coupez le maintien en éveil de la version stable
  (supprimez la variable `GEONEX_PUBLIC_URL` du dépôt : elle s'endormira après 15 minutes et se réveillera en environ une minute).
- L'aperçu n'a pas de maintien en éveil : premier chargement ≈ 1 minute après une période d'inactivité.
- Ce qui est partagé : le dépôt, rien d'autre (sauf la base si vous sautez l'étape 1). Les secrets sont distincts.

### Fin de l'essai
- **Vous adoptez la v2** : `git switch main && git merge v2 && git push origin main` (la version stable passe en v2 ; `v1.0` reste récupérable,
  voir `docs/VERSIONS.md`), puis supprimez le service `geonex-v2` (Render → *Settings* → *Delete Service*) et la branche Neon `apercu-v2`.
- **Vous renoncez** : supprimez le service `geonex-v2` et la branche Neon ; `main` n'a jamais changé.

### Vérifié / non vérifié
- Vérifié : la v2 passe les tests automatiques (moteur, API) sur GitHub, le fichier `render.preview.yaml` est valide, les dépendances sont
  cohérentes avec le fichier de verrouillage (`npm ci`), la v2 tourne en local avec le mode essai.
- Non vérifié : la construction Docker de la v2 sur Render (Docker n'est pas installé ici ; la v1 a été construite avec le même `Dockerfile`),
  le comportement avec la base Neon d'essai, la présence d'un champ « chemin du fichier » dans l'interface Render au moment où vous créez le Blueprint.

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
