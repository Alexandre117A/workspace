#!/usr/bin/env node
// Lance GEONEX en local, en une commande :
//   1. prépare ce qui manque au premier démarrage (dépendances npm, Python du moteur,
//      compilation de l'API, export de l'application web) ;
//   2. démarre le moteur (Python) et l'API, qui sert aussi l'application web ;
//   3. ouvre le navigateur et affiche l'adresse à partager sur le réseau local.
// Options : --no-open (ne pas ouvrir le navigateur), --rebuild (reconstruire le client web).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const say = (m) => console.log(`\n[GEONEX] ${m}`);
const die = (m) => {
  console.error(`\n[GEONEX] ERREUR : ${m}`);
  process.exit(1);
};

// ------------------------------------------------------------------ configuration (.env)
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
// Chemins non ASCII (ex. « Новая папка ») : Python doit écrire en UTF-8 même sur une console Windows.
process.env.PYTHONUTF8 = "1";
process.env.PYTHONIOENCODING = "utf-8";
const apiPort = Number(process.env.PORT ?? 4000);
const enginePort = Number(process.env.GEONEX_ENGINE_PORT ?? 8100);
const token = process.env.GEONEX_ENGINE_TOKEN || randomBytes(16).toString("hex");

// ------------------------------------------------------------------ utilitaires
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: root, shell: win && /^(npm|npx)$/.test(cmd), env: process.env, ...opts });
  if (r.status !== 0) die(`échec de « ${cmd} ${cmdArgs.join(" ")} »`);
}

function newest(dir, exts) {
  let t = 0;
  if (!existsSync(dir)) return 0;
  const skip = new Set(["node_modules", "dist", ".expo", ".data", ".venv", "__pycache__"]);
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.some((x) => e.name.endsWith(x))) t = Math.max(t, statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return t;
}
const SRC = [".ts", ".tsx", ".json", ".js", ".mjs", ".wav", ".png"];
const stale = (out, ...dirs) => !existsSync(out) || dirs.some((d) => newest(d, SRC) > statSync(out).mtimeMs);

async function healthy(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function openBrowser(url) {
  if (args.has("--no-open")) return;
  try {
    if (win) spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ouverture manuelle */
  }
}

function lanUrls() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) out.push(`http://${i.address}:${apiPort}`);
  return out;
}

// ------------------------------------------------------------------ déjà lancé ?
if (await healthy(apiPort)) {
  say(`GEONEX tourne déjà sur http://localhost:${apiPort}`);
  openBrowser(`http://localhost:${apiPort}`);
  process.exit(0);
}

// ------------------------------------------------------------------ 1. dépendances npm
if (!existsSync(join(root, "node_modules", "@nestjs", "core"))) {
  say("Installation des dépendances (premier démarrage, quelques minutes)…");
  run("npm", ["install", "--no-audit", "--no-fund"]);
}

// ------------------------------------------------------------------ 2. moteur Python
const venvPy = join(root, "services", "engine", ".venv", win ? "Scripts" : "bin", win ? "python.exe" : "python");
const venvReady = () => existsSync(venvPy) && spawnSync(venvPy, ["-c", "import fastapi, uvicorn, pydantic, httpx"], { stdio: "ignore" }).status === 0;

function findPython() {
  const cands = [];
  if (process.env.GEONEX_PYTHON) cands.push([process.env.GEONEX_PYTHON, []]);
  if (win) {
    cands.push(["py", ["-3"]]);
    const base = join(process.env.LOCALAPPDATA ?? "", "Programs", "Python");
    if (existsSync(base)) for (const d of readdirSync(base).sort().reverse()) cands.push([join(base, d, "python.exe"), []]);
  }
  cands.push(["python3", []], ["python", []]);
  for (const [cmd, a] of cands) {
    const r = spawnSync(cmd, [...a, "-c", "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"], { stdio: "ignore" });
    if (r.status === 0) return [cmd, a];
  }
  return null;
}

if (!venvReady()) {
  say("Préparation du moteur de simulation (Python)…");
  let py = findPython();
  if (!py && win) {
    say("Python 3.11+ est introuvable : installation de Python 3.13 pour votre utilisateur (winget)…");
    spawnSync("winget", ["install", "-e", "--id", "Python.Python.3.13", "--scope", "user", "--silent", "--accept-package-agreements", "--accept-source-agreements"], { stdio: "inherit" });
    py = findPython();
  }
  if (!py) die("Python 3.11 ou plus récent est requis (https://www.python.org/downloads/). Installez-le puis relancez, ou définissez GEONEX_PYTHON.");
  run(py[0], [...py[1], "-m", "venv", join(root, "services", "engine", ".venv")]);
  run(venvPy, ["-m", "pip", "install", "--quiet", "-r", join(root, "services", "engine", "requirements.txt")]);
}

// ------------------------------------------------------------------ 3. compilation API + client web
if (stale(join(root, "packages", "shared", "dist", "index.js"), join(root, "packages", "shared", "src"))) {
  say("Compilation du paquet partagé…");
  run("npm", ["run", "build", "-w", "@geonex/shared"]);
}
if (stale(join(root, "services", "api", "dist", "main.js"), join(root, "services", "api", "src"), join(root, "packages", "shared", "src"))) {
  say("Compilation de l'API…");
  run("npm", ["run", "build", "-w", "@geonex/api"]);
}
const webIndex = join(root, "apps", "client", "dist", "index.html");
if (args.has("--rebuild") || stale(webIndex, join(root, "apps", "client", "src"), join(root, "apps", "client", "assets"), join(root, "packages", "shared", "src"))) {
  say("Construction de l'application web (première fois : 1 à 2 minutes)…");
  // Même origine que l'API : l'adresse du serveur est déduite de la page elle-même.
  run("npx", ["expo", "export", "--platform", "web"], { cwd: join(root, "apps", "client"), env: { ...process.env, EXPO_PUBLIC_API_URL: "" } });
}

// ------------------------------------------------------------------ 4. démarrage des services
const children = [];
function start(name, cmd, cmdArgs, opts) {
  const c = spawn(cmd, cmdArgs, { stdio: ["ignore", "pipe", "pipe"], env: process.env, ...opts });
  const pipe = (stream, out) => stream.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => out.write(`[${name}] ${l}\n`)));
  pipe(c.stdout, process.stdout);
  pipe(c.stderr, process.stderr);
  c.on("exit", (code) => {
    if (!stopping) {
      console.error(`\n[GEONEX] Le service « ${name} » s'est arrêté (code ${code}).`);
      stop(1);
    }
  });
  children.push(c);
}
let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const c of children) {
    try {
      if (win) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else c.kill("SIGTERM");
    } catch {
      /* déjà arrêté */
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

const shared = {
  ...process.env,
  GEONEX_ENGINE_TOKEN: token,
  GEONEX_ENGINE_URL: `http://127.0.0.1:${enginePort}`,
  PORT: String(apiPort),
  PYTHONIOENCODING: "utf-8",
};
process.env = shared;
say("Démarrage du moteur et du serveur…");
start("moteur", venvPy, ["-m", "uvicorn", "geonex_engine.api:app", "--host", "127.0.0.1", "--port", String(enginePort), "--log-level", "warning"], { cwd: join(root, "services", "engine"), env: shared });
start("serveur", process.execPath, [join(root, "services", "api", "dist", "main.js")], { cwd: join(root, "services", "api"), env: shared });

let ready = null;
for (let i = 0; i < 120 && !ready; i++) {
  await new Promise((r) => setTimeout(r, 750));
  const h = await healthy(apiPort);
  if (h?.engine?.status === "ok") ready = h;
}
if (!ready) die("Le serveur n'a pas répondu à temps. Consultez les messages ci-dessus.");

const local = `http://localhost:${apiPort}`;
console.log("\n──────────────────────────────────────────────────────────────");
console.log("  GEONEX est prêt.");
console.log(`  Sur cet ordinateur :   ${local}`);
for (const u of lanUrls()) console.log(`  Autres appareils (même Wi-Fi) : ${u}`);
console.log(`  IA : ${ready.engine.ai?.enabled ? "active" : "non configurée (règles du moteur)"}  ·  Recherche : ${ready.engine.research ? "activée" : "désactivée"}`);
console.log("  Pour arrêter : fermez cette fenêtre ou appuyez sur Ctrl+C.");
console.log("──────────────────────────────────────────────────────────────\n");
openBrowser(local);
