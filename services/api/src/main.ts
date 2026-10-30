import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { config } from "./config";

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: process.env.GEONEX_QUIET ? ["error", "warn"] : undefined });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: config.corsOrigins.includes("*") ? true : config.corsOrigins, credentials: true });
  app.enableShutdownHooks();
  // L'API sert aussi l'application web (export Expo) : une seule adresse pour tous les appareils.
  const webDir = process.env.GEONEX_WEB_DIR ?? join(__dirname, "..", "..", "..", "apps", "client", "dist");
  if (existsSync(join(webDir, "index.html"))) {
    const express = require("express");
    app.use(express.static(webDir, { index: false, maxAge: "1h" }));
    app.use((req: any, res: any, next: () => void) => {
      if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
      res.sendFile(join(webDir, "index.html"));
    });
  }
  return app;
}

if (require.main === module) {
  createApp()
    .then(async (app) => {
      await app.listen(config.port, "0.0.0.0");
      new Logger("GEONEX").log(`API prête sur http://localhost:${config.port}/api (moteur : ${config.engineUrl})`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
