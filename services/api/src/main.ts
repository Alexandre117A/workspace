import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import compression from "compression";
import { AppModule } from "./app.module";
import { config } from "./config";
import { rateLimiter } from "./ratelimit";

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: process.env.GEONEX_QUIET ? ["error", "warn"] : undefined });
  // Derrière le proxy de l'hébergeur : l'adresse du visiteur vient de X-Forwarded-For (un seul saut de confiance).
  (app.getHttpAdapter().getInstance() as any).set("trust proxy", 1);
  app.use(compression()); // JavaScript, JSON et cartes : 3 à 4 fois moins d'octets sur l'offre gratuite
  app.use(rateLimiter());
  app.setGlobalPrefix("api");
  app.enableCors({ origin: config.corsOrigins.includes("*") ? true : config.corsOrigins, credentials: true });
  app.enableShutdownHooks();
  // L'API sert aussi l'application web (export Expo) : une seule adresse pour tous les appareils.
  const webDir = process.env.GEONEX_WEB_DIR ?? join(__dirname, "..", "..", "..", "apps", "client", "dist");
  if (existsSync(join(webDir, "index.html"))) {
    const express = require("express");
    // Fichiers à empreinte (JS, images, polices) : conservés un an. La page d'entrée n'est jamais mise en cache : après un
    // déploiement, un visiteur reçoit tout de suite les nouveaux noms de fichiers.
    app.use(express.static(webDir, {
      index: false,
      maxAge: "1h",
      setHeaders: (res: any, file: string) => {
        const f = file.replace(/\\/g, "/");
        if (f.includes("/_expo/static/") || f.includes("/assets/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else if (f.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }));
    // Un fichier qui n'existe plus (onglet resté ouvert avant un déploiement) doit répondre 404, jamais la page d'accueil : sinon le
    // navigateur tente d'exécuter du HTML comme du JavaScript et affiche « Loading module … failed ».
    const FILE = /\.(?:js|mjs|css|map|png|jpe?g|webp|gif|svg|ico|ttf|otf|woff2?|json|webmanifest|txt)$/i;
    app.use((req: any, res: any, next: () => void) => {
      if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
      if (req.path.startsWith("/_expo/") || FILE.test(req.path)) return res.status(404).type("text/plain").send("Introuvable");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile("index.html", { root: webDir });
    });
  }
  return app;
}

if (require.main === module) {
  createApp()
    .then(async (app) => {
      await app.listen(config.port, "0.0.0.0");
      new Logger("GEONEX").log(`API prête sur http://localhost:${config.port}/api (moteur : ${config.engineUrl})`);
      if (process.env.NODE_ENV === "production" && config.dbMode !== "postgres") {
        new Logger("GEONEX").warn("Aucune base PostgreSQL (DATABASE_URL) : les comptes et les parties seront PERDUS à chaque redémarrage du serveur.");
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
