#!/usr/bin/env node
// Démarrage « production » en un seul conteneur : le moteur Python (127.0.0.1) puis l'API + l'application web.
// Si l'un des deux s'arrête, tout s'arrête (l'hébergeur relance alors le conteneur). Arrêt propre sur SIGTERM.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const enginePort = process.env.GEONEX_ENGINE_PORT ?? "8100";
const python = process.env.GEONEX_PYTHON ?? "python";
const log = (m) => console.log(`[GEONEX] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = {
  ...process.env,
  GEONEX_ENGINE_URL: `http://127.0.0.1:${enginePort}`,
  PYTHONUTF8: "1",
  PYTHONUNBUFFERED: "1",
};

const engine = spawn(python, ["-m", "uvicorn", "geonex_engine.api:app", "--host", "127.0.0.1", "--port", enginePort, "--log-level", "warning"], {
  cwd: join(root, "services", "engine"),
  env,
  stdio: "inherit",
});
let api;
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  api?.kill("SIGTERM");
  engine.kill("SIGTERM");
  setTimeout(() => process.exit(code), 4000).unref();
  Promise.allSettled([new Promise((r) => engine.once("exit", r)), api ? new Promise((r) => api.once("exit", r)) : Promise.resolve()]).then(() => process.exit(code));
};
engine.on("exit", (c) => {
  if (!stopping) log(`le moteur s'est arrêté (code ${c}) : arrêt du service`);
  stop(c ?? 1);
});
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

let ready = false;
for (let i = 0; i < 200 && !stopping; i++) {
  try {
    if ((await fetch(`${env.GEONEX_ENGINE_URL}/health`)).ok) { ready = true; break; }
  } catch { /* pas encore prêt */ }
  await sleep(150);
}
if (!ready) {
  log("le moteur ne répond pas : arrêt");
  stop(1);
} else {
  log("moteur prêt");
  api = spawn(process.execPath, [join(root, "services", "api", "dist", "main.js")], { cwd: root, env, stdio: "inherit" });
  api.on("exit", (c) => {
    if (!stopping) log(`l'API s'est arrêtée (code ${c}) : arrêt du service`);
    stop(c ?? 1);
  });
}
