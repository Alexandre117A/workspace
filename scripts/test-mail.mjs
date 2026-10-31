#!/usr/bin/env node
// Vérifie la configuration d'envoi d'e-mails de GEONEX SANS démarrer le serveur ni toucher à la base :
//   node scripts/test-mail.mjs                   → contrôle la configuration et la connexion SMTP (aucun message envoyé)
//   node scripts/test-mail.mjs vous@exemple.fr   → envoie en plus un message de test à cette adresse
//   node scripts/test-mail.mjs --preview         → écrit les modèles d'e-mails en HTML dans .tools/mail-previews/ (à ouvrir dans un navigateur)
// Lit le fichier .env à la racine (ou les variables d'environnement). Prérequis : npm run build:api. Aucun secret n'est affiché.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const dist = join(root, "services", "api", "dist");
if (!existsSync(join(dist, "mailer.js"))) {
  console.error("Le serveur n'est pas compilé : lancez d'abord « npm run build:api ».");
  process.exit(1);
}
const require = createRequire(import.meta.url);
const { mailDiagnosis, smtpTransport } = require(join(dist, "mailer.js"));
const { inviteEmail, resetEmail, testEmail, verifyEmail, welcomeEmail } = require(join(dist, "emails.js"));
const { config } = require(join(dist, "config.js"));

if (process.argv.includes("--preview")) {
  const base = config.publicUrl;
  const out = join(root, ".tools", "mail-previews");
  mkdirSync(out, { recursive: true });
  const files = {
    "bienvenue": welcomeEmail({ pseudonym: "Alexandre", verifyUrl: `${base}/verify?token=exemple` }),
    "verification": verifyEmail({ pseudonym: "Alexandre", verifyUrl: `${base}/verify?token=exemple` }),
    "reinitialisation": resetEmail({ pseudonym: "Alexandre", resetUrl: `${base}/reset?token=exemple` }),
    "invitation": inviteEmail({ from: "Alice", session: "Crise des missiles de Cuba", url: `${base}/invite?token=exemple` }),
    "test": testEmail({ to: "vous@exemple.fr" }),
  };
  for (const [name, m] of Object.entries(files)) { writeFileSync(join(out, `${name}.html`), m.html); console.log(`  ${join(out, `${name}.html`)}  — objet : ${m.subject}`); }
  console.log("Modèles écrits (les liens contiennent un jeton d'exemple, sans valeur). Ouvrez-les dans un navigateur.");
  process.exit(0);
}

const HINTS = {
  EAUTH: "identifiants refusés : vérifiez SMTP_USER / SMTP_PASS (ou l'identifiant et la clé de SMTP_URL) ; beaucoup de fournisseurs exigent une clé SMTP distincte du mot de passe du compte.",
  ECONNECTION: "connexion impossible : vérifiez l'hôte et le port (587 en général, avec STARTTLS ; 465 avec SMTP_SECURE=true).",
  ESOCKET: "connexion coupée ou refusée : hôte, port, ou SMTP_SECURE incohérents (465 ↔ true, 587 ↔ false).",
  ETIMEDOUT: "délai dépassé : hôte ou port incorrect, ou sortie réseau bloquée.",
  ENOTFOUND: "nom d'hôte introuvable : vérifiez l'orthographe de SMTP_HOST.",
  EENVELOPE: "adresse refusée : l'expéditeur (GEONEX_MAIL_FROM) doit être validé chez le fournisseur, et le destinataire valide.",
  EMESSAGE: "message refusé par le fournisseur : expéditeur non validé ou domaine non authentifié (SPF / DKIM).",
};
const hint = (code) => HINTS[code] ?? "voir le code d'erreur dans la documentation du fournisseur.";

const d = mailDiagnosis();
console.log("Configuration d'envoi d'e-mails de GEONEX");
console.log(`  Fournisseur     : ${d.provider}${d.provider === "log" ? " (développement : rien n'est envoyé)" : ""}`);
console.log(`  Hôte SMTP       : ${d.host ?? "—"}`);
console.log(`  Expéditeur      : ${d.from ?? "—"}`);
console.log(`  Adresse publique: ${d.publicUrl}${/localhost/.test(d.publicUrl) ? "  ⚠ liens locaux dans les e-mails" : ""}`);
console.log(`  Réponse à       : ${config.mail.replyTo || "—"}`);
console.log(`  Adresse vérifiée exigée : ${config.requireVerified ? "oui (appliquée seulement si l'envoi fonctionne)" : "non"}`);
if (d.provider !== "smtp") {
  console.log("\n✖ Aucun fournisseur SMTP configuré : GEONEX n'enverra aucun e-mail (et le dit aux utilisateurs).");
  console.log("  Voir docs/EMAILS.md pour choisir un fournisseur et renseigner SMTP_URL et GEONEX_MAIL_FROM.");
  process.exit(1);
}
if (d.problems.length) { console.log(""); for (const p of d.problems) console.log(`${/^GEONEX_PUBLIC_URL/.test(p) ? "⚠" : "✖"} ${p}`); }
if (!d.configured) process.exit(1);

const transport = smtpTransport();
try {
  await transport.verify();
  console.log("\n✔ Connexion SMTP et authentification : OK");
} catch (e) {
  console.log(`\n✖ Connexion SMTP : ${e.code ?? e.message}\n  → ${hint(e.code)}`);
  process.exit(1);
}

const to = process.argv[2];
if (!to) {
  console.log("  (aucun message envoyé : ajoutez une adresse pour recevoir un message de test)");
  process.exit(0);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) { console.error(`✖ « ${to} » n'est pas une adresse valide.`); process.exit(1); }
try {
  const m = testEmail({ to });
  const info = await transport.sendMail({ from: config.mail.from, to, subject: m.subject, html: m.html, text: m.text, headers: { "Auto-Submitted": "auto-generated" } });
  console.log(`✔ Message accepté par le fournisseur pour ${info.accepted.join(", ")}${info.rejected.length ? ` (refusé pour ${info.rejected.join(", ")})` : ""}.`);
  console.log("  « Accepté » ne veut pas dire « reçu » : regardez la boîte de réception ET les courriers indésirables, et vérifiez l'expéditeur affiché.");
} catch (e) {
  console.log(`✖ Envoi : ${e.code ?? e.message}\n  → ${hint(e.code)}`);
  process.exit(1);
}
