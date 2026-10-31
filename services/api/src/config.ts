import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Configuration par variables d'environnement (voir .env.example). */
const dataDir = resolve(process.env.GEONEX_DATA_DIR ?? join(__dirname, "..", ".data"));

function jwtSecret(): string {
  if (process.env.GEONEX_JWT_SECRET) return process.env.GEONEX_JWT_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("GEONEX_JWT_SECRET est obligatoire en production.");
  // Développement : secret local généré une fois et conservé dans .data/.
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, "jwt-secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString("hex"));
  return readFileSync(file, "utf8").trim();
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dataDir,
  databaseUrl: process.env.DATABASE_URL,
  dbMode: process.env.GEONEX_DB ?? (process.env.DATABASE_URL ? "postgres" : "pglite"),
  engineUrl: process.env.GEONEX_ENGINE_URL ?? "http://127.0.0.1:8100",
  engineToken: process.env.GEONEX_ENGINE_TOKEN ?? "",
  jwtSecret: jwtSecret(),
  ownerEmails: (process.env.GEONEX_OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  corsOrigins: (process.env.GEONEX_CORS_ORIGINS ?? "*").split(",").map((o) => o.trim()),
  /** Facteur d'échelle des chronomètres (tests automatisés : 0.01 → 45 s deviennent 0,45 s). */
  timeScale: Number(process.env.GEONEX_TIME_SCALE ?? 1),
  sessionTtlHours: Number(process.env.GEONEX_SESSION_TTL_HOURS ?? 48),
  livekit: {
    url: process.env.LIVEKIT_URL ?? "",
    apiKey: process.env.LIVEKIT_API_KEY ?? "",
    apiSecret: process.env.LIVEKIT_API_SECRET ?? "",
  },
  /** Monétisation future : désactivée par défaut, aucune publicité intégrée. */
  ads: { enabled: process.env.GEONEX_ADS_ENABLED === "true", provider: process.env.GEONEX_ADS_PROVIDER ?? null },
  demoMode: process.env.GEONEX_DEMO === "true",
  /** Adresse publique du service : sert à construire les liens d'invitation affichés dans l'application. */
  publicUrl: (process.env.GEONEX_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/+$/, ""),
  /** Modération des scénarios proposés à la bibliothèque publique : « on » (défaut) = validation par un administrateur. */
  moderation: (process.env.GEONEX_MODERATION ?? "on").toLowerCase() !== "off",
  /** Service d'essai (aperçu d'une version à l'étude) : l'interface l'affiche, avec un lien vers la version stable. */
  preview: process.env.GEONEX_PREVIEW === "true",
  stableUrl: process.env.GEONEX_STABLE_URL ?? null,
};

export function ms(seconds: number): number {
  return Math.max(1, Math.round(seconds * 1000 * config.timeScale));
}
