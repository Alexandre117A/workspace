import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { config } from "./config";

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: process.env.GEONEX_QUIET ? ["error", "warn"] : undefined });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: config.corsOrigins.includes("*") ? true : config.corsOrigins, credentials: true });
  app.enableShutdownHooks();
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
