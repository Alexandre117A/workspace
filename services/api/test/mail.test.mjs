// Chaîne d'envoi d'e-mails de bout en bout : API → nodemailer → un VRAI serveur SMTP (local, avec authentification) qui reçoit,
// analyse et mémorise chaque message. Prouve le chemin SMTP complet (en-têtes, expéditeur, HTML + texte, liens), la règle
// « adresse vérifiée exigée » et l'état honnête « échec » sans fournisseur externe ni envoi à de vraies personnes.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { startStack } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { SMTPServer } = require("smtp-server");
const { simpleParser } = require("mailparser");

const received = [];
let smtp, stack, smtpOpen = false;
const PW = "motdepasse-solide9";

before(async () => {
  smtp = new SMTPServer({
    authOptional: false, allowInsecureAuth: true, disabledCommands: ["STARTTLS"], logger: false,
    onAuth(auth, _session, cb) { auth.username === "geonex" && auth.password === "cle-de-test" ? cb(null, { user: "geonex" }) : cb(new Error("Identifiants refusés")); },
    onData(stream, session, cb) { simpleParser(stream).then((mail) => { received.push({ mail, envelope: session.envelope }); cb(); }).catch(cb); },
  });
  await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  smtpOpen = true;
  const port = smtp.server.address().port;
  stack = await startStack({
    owners: "boss@geonex.test",
    env: { GEONEX_MAIL_PROVIDER: "smtp", SMTP_URL: `smtp://geonex:cle-de-test@127.0.0.1:${port}`, GEONEX_MAIL_FROM: "GEONEX <no-reply@exemple.test>", GEONEX_PUBLIC_URL: "https://geonex.exemple.test", GEONEX_REQUIRE_VERIFIED: "true" },
  });
});
after(async () => {
  await stack?.stop();
  if (smtpOpen) await new Promise((r) => smtp.close(r));
});

const reg = (email, pseudonym) => stack.api("/auth/register", { method: "POST", body: { email, pseudonym, password: PW, passwordConfirm: PW, acceptTerms: true } });
const mailTo = (to, subjectPart) => [...received].reverse().find((m) => m.envelope.rcptTo.some((r) => r.address === to) && m.mail.subject.includes(subjectPart));
const tokenOf = (m) => m.mail.text.match(/token=([\w-]+)/)[1];

test("l'inscription envoie un vrai message SMTP, complet et conforme", async () => {
  const r = await reg("zoe@geonex.test", "Zoe");
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual(r.data.email, { status: "sent", configured: true });
  const m = mailTo("zoe@geonex.test", "Bienvenue sur GEONEX");
  assert.ok(m, "le serveur SMTP a bien reçu le message");
  assert.equal(m.mail.subject, "Bienvenue sur GEONEX — Votre aventure géopolitique commence.");
  assert.equal(m.mail.from.value[0].address, "no-reply@exemple.test");
  assert.equal(m.mail.from.value[0].name, "GEONEX");
  assert.equal(m.envelope.mailFrom.address, "no-reply@exemple.test");
  assert.equal(m.mail.headers.get("auto-submitted"), "auto-generated");
  assert.match(m.mail.html, /Bienvenue sur GEONEX, Zoe !/);
  assert.match(m.mail.html, /https:\/\/geonex\.exemple\.test\/apple-touch-icon\.png/, "logo servi par l'adresse publique");
  assert.match(m.mail.text, /^Bienvenue sur GEONEX, Zoe !/);
  assert.match(m.mail.text, /https:\/\/geonex\.exemple\.test\/verify\?token=[\w-]{40,}/, "lien personnel bâti sur GEONEX_PUBLIC_URL");
  assert.ok(m.mail.html.includes("ACCÉDER À MON ESPACE GEONEX"));
  assert.ok(!/localhost/.test(m.mail.html + m.mail.text), "aucun lien local dans un e-mail de production");
});

test("règle « adresse vérifiée exigée » : refus puis accès après confirmation par le lien reçu", async () => {
  const { api } = stack;
  const zoe = (await api("/auth/login", { method: "POST", body: { email: "zoe@geonex.test", password: PW } })).data;
  assert.equal((await api("/auth/me", { token: zoe.token })).data.requireVerified, true);
  const job = { mode: "contemporary", prompt: "Crise Chine–Taïwan", players: 2 };
  const refused = await api("/scenarios/jobs", { method: "POST", token: zoe.token, body: job });
  assert.equal(refused.status, 403);
  assert.match(refused.data.message, /Confirmez votre adresse e-mail/);
  const token = tokenOf(mailTo("zoe@geonex.test", "Bienvenue"));
  assert.equal((await api("/auth/verify", { method: "POST", body: { token } })).status, 201);
  assert.equal((await api("/scenarios/jobs", { method: "POST", token: zoe.token, body: job })).status, 201, "accès ouvert une fois l'adresse confirmée");
});

test("administration : état réel de l'envoi, test vers l'adresse de l'administrateur, accès réservé", async () => {
  const { api } = stack;
  const boss = await reg("boss@geonex.test", "Boss");
  assert.equal((await api("/auth/me", { token: boss.data.token })).data.role, "user", "adresse non vérifiée : pas d'administrateur (même si elle figure dans la liste)");
  await api("/auth/verify", { method: "POST", body: { token: tokenOf(mailTo("boss@geonex.test", "Bienvenue")) } });
  assert.equal((await api("/auth/me", { token: boss.data.token })).data.role, "owner", "administrateur une fois l'adresse vérifiée");
  const t = boss.data.token;
  assert.equal((await api("/admin/mail", { token: (await api("/auth/login", { method: "POST", body: { email: "zoe@geonex.test", password: PW } })).data.token })).status, 403);
  const state = (await api("/admin/mail", { token: t })).data;
  assert.equal(state.configured, true);
  assert.equal(state.provider, "smtp");
  assert.equal(state.from, "GEONEX <no-reply@exemple.test>");
  assert.deepEqual(state.verify, { ok: true });
  assert.ok(state.last7days.sent >= 2);
  assert.ok(!/cle-de-test/.test(JSON.stringify(state)), "aucun secret dans la réponse");
  const test = await api("/admin/mail/test", { method: "POST", token: t });
  assert.equal(test.data.status, "sent");
  assert.equal(test.data.to, "boss@geonex.test");
  const m = mailTo("boss@geonex.test", "Test d'envoi");
  assert.ok(m && /L'envoi d'e-mails fonctionne/.test(m.mail.text));
});

test("fournisseur injoignable : le compte est créé, l'échec est dit tel quel, rien n'est annoncé comme envoyé", async () => {
  const { api } = stack;
  await new Promise((r) => smtp.close(r));
  smtpOpen = false;
  const r = await reg("yann@geonex.test", "Yann");
  assert.equal(r.status, 201, "un incident d'e-mail n'annule jamais l'inscription");
  assert.equal(r.data.email.status, "failed");
  assert.equal(r.data.email.configured, true);
  assert.equal((await api("/auth/login", { method: "POST", body: { email: "yann@geonex.test", password: PW } })).status, 201, "le compte est utilisable");
  assert.deepEqual((await api("/auth/forgot", { method: "POST", body: { email: "yann@geonex.test" } })).data, { ok: true }, "réponse neutre même quand l'envoi échoue");
  const boss = (await api("/auth/login", { method: "POST", body: { email: "boss@geonex.test", password: PW } })).data;
  const state = (await api("/admin/mail", { token: boss.token })).data;
  assert.ok(state.last7days.failed >= 1);
  assert.equal(state.verify.ok, false);
  assert.ok(state.recentFailures.length >= 1);

  // Trois échecs d'envoi consécutifs : la règle « adresse vérifiée exigée » se suspend d'elle-même, pour ne bloquer personne.
  const ines = await reg("ines@geonex.test", "Ines");
  assert.equal(ines.data.email.status, "failed");
  const me = (await api("/auth/me", { token: ines.data.token })).data;
  assert.equal(me.requireVerified, false, "règle suspendue : plus personne ne peut recevoir son lien");
  const job = await api("/scenarios/jobs", { method: "POST", token: ines.data.token, body: { mode: "contemporary", prompt: "Crise Chine–Taïwan", players: 2 } });
  assert.equal(job.status, 201, "l'accès n'est plus bloqué tant que les e-mails sont en panne");
  assert.equal((await api("/admin/mail", { token: boss.token })).data.healthy, false);
});
