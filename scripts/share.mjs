#!/usr/bin/env node
// Rend GEONEX accessible à TOUT LE MONDE par un lien public, sans compte ni hébergement : un tunnel Cloudflare
// « quick tunnel » relie une adresse https://….trycloudflare.com à votre ordinateur.
//
// À SAVOIR : le lien ne fonctionne que tant que cet ordinateur et GEONEX restent allumés, et il change à chaque
// lancement. Pour un accès permanent 24 h/24, il faut un hébergement (voir docs/DEPLOIEMENT.md et docs/GITHUB.md).
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4000);
const win = process.platform === "win32";
const exe = join(root, ".tools", win ? "cloudflared.exe" : "cloudflared");
const asset = win ? "cloudflared-windows-amd64.exe" : process.platform === "darwin" ? "cloudflared-darwin-amd64.tgz" : "cloudflared-linux-amd64";
const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;

const say = (m) => console.log(`\n[GEONEX] ${m}`);
try {
  const h = await fetch(`http://127.0.0.1:${port}/api/health`);
  if (!h.ok) throw new Error();
} catch {
  console.error(`\n[GEONEX] GEONEX ne tourne pas sur le port ${port}. Lancez d'abord « Lancer GEONEX.bat », puis relancez ce partage.`);
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log("\nCe partage rend GEONEX accessible à toute personne qui connaît le lien (visible sur Internet).");
console.log("Les parties restent protégées par leurs codes de session, mais n'importe qui peut ouvrir l'application et créer un profil invité.");
if (!existsSync(exe)) console.log(`Premier usage : téléchargement de l'outil officiel « cloudflared » (Cloudflare) depuis ${url}`);
const ok = (await rl.question("\nTapez « oui » pour continuer : ")).trim().toLowerCase();
rl.close();
if (ok !== "oui") {
  say("Annulé : rien n'a été téléchargé ni ouvert.");
  process.exit(0);
}

if (!existsSync(exe)) {
  if (asset.endsWith(".tgz")) {
    console.error("Sur macOS, installez cloudflared avec Homebrew (brew install cloudflared) puis lancez : cloudflared tunnel --url http://localhost:" + port);
    process.exit(1);
  }
  mkdirSync(dirname(exe), { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    console.error(`Téléchargement impossible (${res.status}).`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(exe, { mode: 0o755 }));
  say("Outil téléchargé.");
}

say("Ouverture du lien public…");
const child = spawn(exe, ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
let shown = false;
const scan = (d) => {
  const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    console.log("\n──────────────────────────────────────────────────────────────");
    console.log(`  Lien public de GEONEX :   ${m[0]}`);
    console.log("  Partagez-le : tout le monde peut l'ouvrir (tant que cet ordinateur reste allumé).");
    console.log("  Pour arrêter le partage : fermez cette fenêtre ou Ctrl+C.");
    console.log("──────────────────────────────────────────────────────────────\n");
  }
};
child.stdout.on("data", scan);
child.stderr.on("data", scan);
child.on("exit", (c) => process.exit(c ?? 0));
process.on("SIGINT", () => child.kill());
