// Démarre un vrai moteur Python et une vraie API (PGlite en mémoire) pour les tests d'intégration.
// GEONEX_TEST_DATABASE_URL=postgres://… : exécute les mêmes tests sur un vrai PostgreSQL (chemin de production, base vide requise).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..");
const require = createRequire(import.meta.url);

function pythonPath() {
  const win = process.platform === "win32";
  const bin = (v) => join(v, win ? "Scripts" : "bin", win ? "python.exe" : "python");
  return [process.env.GEONEX_PYTHON, bin(join(root, "services", "engine", ".venv")), process.env.LOCALAPPDATA && bin(join(process.env.LOCALAPPDATA, "geonex", "engine-venv"))]
    .filter(Boolean)
    .find((p) => existsSync(p));
}

export async function startStack({ timeScale = 0.05, owners = "" } = {}) {
  const enginePort = 8190 + Math.floor(Math.random() * 400);
  const python = pythonPath();
  if (!python) throw new Error("Interpréteur Python du moteur introuvable (npm run setup:engine)");
  const engine = spawn(python, ["-m", "uvicorn", "geonex_engine.api:app", "--port", String(enginePort), "--log-level", "warning"], {
    cwd: join(root, "services", "engine"),
    env: { ...process.env, GEONEX_AI: "off", GEONEX_RESEARCH: "off", GEONEX_ENGINE_TOKEN: "test-token" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const engineUrl = `http://127.0.0.1:${enginePort}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(engineUrl + "/health")).ok) break;
    } catch {}
    await sleep(150);
  }
  Object.assign(process.env, {
    GEONEX_DB: process.env.GEONEX_TEST_DATABASE_URL ? "postgres" : "memory", GEONEX_RATE_LIMIT: "off", ...(process.env.GEONEX_TEST_DATABASE_URL ? { DATABASE_URL: process.env.GEONEX_TEST_DATABASE_URL } : {}),
    GEONEX_ENGINE_URL: engineUrl, GEONEX_ENGINE_TOKEN: "test-token", GEONEX_TIME_SCALE: String(timeScale),
    GEONEX_JWT_SECRET: "test-secret-0123456789", GEONEX_OWNER_EMAILS: owners, GEONEX_QUIET: "1", GEONEX_MAIL_PROVIDER: "log",
  });
  const { createApp } = require(join(root, "services", "api", "dist", "main.js"));
  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  const { Mailer } = require(join(root, "services", "api", "dist", "mailer.js"));
  const port = app.getHttpServer().address().port;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    mailer: app.get(Mailer),
    api: (path, opts = {}) => request(base, path, opts),
    async stop() {
      await app.close();
      engine.kill();
    },
  };
}

export async function request(base, path, { method = "GET", body, token } = {}) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 20000, interval = 30, label = "condition" } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(interval);
  }
  throw new Error(`Délai dépassé : ${label}`);
}
