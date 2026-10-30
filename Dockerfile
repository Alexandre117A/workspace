# Image API + application web GEONEX (le moteur Python a sa propre image : services/engine/Dockerfile).
# NON TESTÉ sur cette machine (Docker absent) : à valider lors du premier déploiement.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY apps/client/package.json apps/client/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -w @geonex/shared && npm run build -w @geonex/api
# Même origine que l'API : EXPO_PUBLIC_API_URL doit rester vide pour une image tout-en-un.
RUN cd apps/client && EXPO_PUBLIC_API_URL= npx expo export --platform web

FROM node:22-slim
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "services/api/dist/main.js"]
