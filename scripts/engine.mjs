#!/usr/bin/env node
// Lance le moteur Python (serve | test | setup) en trouvant l'interpréteur :
// GEONEX_PYTHON, puis services/engine/.venv, puis %LOCALAPPDATA%/geonex/engine-venv
// (chemin court utile sous Windows quand le dépôt est dans un dossier très profond).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineDir = join(root, "services", "engine");
const win = process.platform === "win32";
const bin = (venv) => join(venv, win ? "Scripts" : "bin", win ? "python.exe" : "python");
const candidates = [
  process.env.GEONEX_PYTHON,
  bin(join(engineDir, ".venv")),
  process.env.LOCALAPPDATA && bin(join(process.env.LOCALAPPDATA, "geonex", "engine-venv")),
].filter(Boolean);

const cmd = process.argv[2] ?? "serve";
let python = candidates.find((p) => existsSync(p));

if (cmd === "setup") {
  const base = process.env.GEONEX_PYTHON_BASE ?? (win ? "python" : "python3");
  const target = process.env.GEONEX_ENGINE_VENV ?? join(engineDir, ".venv");
  run(base, ["-m", "venv", target]);
  run(bin(target), ["-m", "pip", "install", "-r", join(engineDir, "requirements.txt")]);
  process.exit(0);
}
if (!python) {
  console.error("Interpréteur du moteur introuvable. Lancez `npm run setup:engine` (voir docs/DEVELOPPEMENT.md).");
  process.exit(1);
}
const port = process.env.GEONEX_ENGINE_PORT ?? "8100";
if (cmd === "serve") run(python, ["-m", "uvicorn", "geonex_engine.api:app", "--host", "127.0.0.1", "--port", port]);
else if (cmd === "test") run(python, ["-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"]);
else run(python, process.argv.slice(2));

function run(exe, args) {
  const r = spawnSync(exe, args, { cwd: engineDir, stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
