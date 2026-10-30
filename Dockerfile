# Image de production tout-en-un : moteur Python + API NestJS (temps réel) + application web, sur UNE seule adresse.
# Utilisée par render.yaml (hébergement gratuit). Test local : docker build -t geonex . && docker run -p 4000:10000 -e GEONEX_JWT_SECRET=x -e GEONEX_ENGINE_TOKEN=y geonex
# NON TESTÉ en tant qu'image sur cette machine (Docker absent) : chaque étape a été reproduite à la main (voir docs/DEPLOIEMENT.md).

# 1) Compilation : bibliothèque partagée, API, export web de l'application (même origine : EXPO_PUBLIC_API_URL reste vide).
FROM node:22-slim AS build
WORKDIR /app
ENV CI=1 EXPO_NO_TELEMETRY=1
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY apps/client/package.json apps/client/
RUN npm ci --no-audit --no-fund
COPY packages packages
COPY services/api services/api
COPY apps/client apps/client
RUN npm run build -w @geonex/shared && npm run build -w @geonex/api
RUN cd apps/client && EXPO_PUBLIC_API_URL= npx expo export --platform web

# 2) Dépendances d'exécution de l'API uniquement (sans Expo ni React Native : image bien plus légère).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY apps/client/package.json apps/client/
RUN npm ci --omit=dev --no-audit --no-fund -w @geonex/api -w @geonex/shared

# 3) Image finale : Python (moteur) + binaire Node (API) + fichiers compilés.
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONUTF8=1 NODE_ENV=production PORT=10000 GEONEX_PYTHON=python
COPY services/engine/requirements.txt services/engine/requirements.txt
RUN pip install --no-cache-dir -r services/engine/requirements.txt
COPY services/engine/geonex_engine services/engine/geonex_engine
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/services/api/package.json services/api/package.json
COPY --from=build /app/services/api/dist services/api/dist
COPY --from=build /app/services/api/migrations services/api/migrations
COPY --from=build /app/apps/client/dist apps/client/dist
COPY scripts/serve.mjs scripts/serve.mjs
EXPOSE 10000
CMD ["node", "scripts/serve.mjs"]
