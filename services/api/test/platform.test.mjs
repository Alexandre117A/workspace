// Plateforme : comptes (inscription, e-mails, vérification, réinitialisation), profil, invitations, espace personnel,
// bibliothèque (favoris, publication, modération) et suppression de compte. Moteur et API réels, base en mémoire.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startStack, waitFor } from "./helpers.mjs";

let stack;
before(async () => {
  stack = await startStack({ timeScale: 0.05, owners: "boss@geonex.test" });
});
after(async () => {
  await stack?.stop();
});

const PW = "motdepasse-solide9";
const reg = (email, pseudonym, extra = {}) =>
  stack.api("/auth/register", { method: "POST", body: { email, pseudonym, password: PW, passwordConfirm: PW, acceptTerms: true, ...extra } });
const mails = () => stack.mailer.captured;
const lastMail = (to) => [...mails()].reverse().find((m) => m.to === to);
const tokenOf = (mail) => mail.text.match(/token=([\w-]+)/)[1];
const claims = (jwtToken) => JSON.parse(Buffer.from(jwtToken.split(".")[1], "base64url").toString());
const people = {};

async function user(email, pseudonym) {
  const r = await reg(email, pseudonym);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  people[pseudonym] = { token: r.data.token, email, id: r.data.user.id };
  return people[pseudonym];
}

async function scenarioFor(token) {
  const job = await stack.api("/scenarios/jobs", { method: "POST", token, body: { mode: "contemporary", prompt: "Crise Chine–Taïwan", players: 2 } });
  assert.equal(job.status, 201, JSON.stringify(job.data));
  const done = await waitFor(async () => {
    const j = (await stack.api(`/scenarios/jobs/${job.data.jobId}`, { token })).data;
    return j.status === "done" || j.status === "failed" ? j : null;
  }, { label: "préparation du scénario" });
  assert.equal(done.status, "done");
  return done.scenarioId;
}

async function lobby(token, scenarioId) {
  const r = await stack.api("/sessions", { method: "POST", token, body: { scenarioId, teams: 2, durationMinutes: 30, name: "Essai Atlas" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

test("inscription : règles, unicité, e-mail de bienvenue honnête, vérification à usage unique", async () => {
  const { api } = stack;
  assert.equal((await reg("x@geonex.test", "Xavier", { password: "court", passwordConfirm: "court" })).status, 400, "mot de passe trop faible");
  assert.equal((await reg("x@geonex.test", "Xavier", { passwordConfirm: "autre-chose-9x" })).status, 400, "confirmation différente");
  assert.equal((await reg("x@geonex.test", "Xavier", { acceptTerms: false })).status, 400, "conditions non acceptées");
  assert.equal((await reg("x@geonex.test", "x y")).status, 400, "pseudonyme avec espace");
  assert.equal((await reg("x@geonex.test", "xy")).status, 400, "pseudonyme trop court");
  assert.equal((await reg("pas-un-mail", "Xavier")).status, 400, "adresse invalide");
  assert.equal((await api("/auth/pseudonym?value=Alice")).data.available, true);

  const before = mails().length;
  const a = await reg("alice@geonex.test", "Alice");
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(a.data.user.displayName, "Alice");
  assert.deepEqual(a.data.email, { status: "skipped", configured: false }, "aucun fournisseur réel : l'e-mail n'est jamais annoncé comme envoyé");
  assert.equal(mails().length, before + 1, "un seul e-mail de bienvenue");
  const welcome = lastMail("alice@geonex.test");
  assert.equal(welcome.subject, "Bienvenue sur GEONEX — Votre aventure géopolitique commence.");
  assert.match(welcome.html, /Bienvenue sur GEONEX, Alice !/);
  for (const w of ["COMPRENDRE", "SIMULER", "DÉCIDER", "ACCÉDER À MON ESPACE GEONEX"]) assert.ok(welcome.html.toUpperCase().includes(w), w);
  assert.match(welcome.text, /\/verify\?token=/);
  assert.doesNotMatch(JSON.stringify(a.data), /password/i, "aucun mot de passe dans la réponse");

  assert.equal((await api("/auth/pseudonym?value=alice")).data.available, false, "unicité insensible à la casse");
  const dupName = await reg("autre@geonex.test", "ALICE");
  assert.equal(dupName.status, 409);
  assert.match(dupName.data.message, /pseudonyme est déjà utilisé/);
  const dupMail = await reg("alice@geonex.test", "Alicia");
  assert.equal(dupMail.status, 409);
  assert.match(dupMail.data.message, /déjà associée à un compte/);

  const token = a.data.token;
  assert.equal((await api("/auth/me", { token })).data.emailVerified, false);
  const t = tokenOf(welcome);
  const v = await api("/auth/verify", { method: "POST", body: { token: t } });
  assert.equal(v.status, 201);
  assert.equal((await api("/auth/verify", { method: "POST", body: { token: t } })).status, 400, "jeton à usage unique");
  assert.equal((await api("/auth/verify", { method: "POST", body: { token: "x".repeat(40) } })).status, 400, "jeton inconnu");
  assert.equal((await api("/auth/me", { token })).data.emailVerified, true);
  assert.equal((await api("/auth/resend-verification", { method: "POST", token })).data.status, "already");
  people.Alice = { token, email: "alice@geonex.test", id: a.data.user.id };

  // connexion
  assert.equal((await api("/auth/login", { method: "POST", body: { email: "alice@geonex.test", password: "mauvais-mot-de-passe9" } })).status, 401);
  const short = await api("/auth/login", { method: "POST", body: { email: "alice@geonex.test", password: PW } });
  const long = await api("/auth/login", { method: "POST", body: { email: "alice@geonex.test", password: PW, remember: true } });
  const life = (r) => { const c = claims(r.data.token); return c.exp - c.iat; };
  assert.equal(life(short), 86400, "session courte par défaut");
  assert.equal(life(long), 30 * 86400, "« rester connecté » : 30 jours");
  assert.equal((await api("/auth/me")).status, 401, "route privée refusée sans jeton");
});

test("mot de passe oublié : réponse neutre, lien unique et temporaire, révocation des anciennes sessions", async () => {
  const { api } = stack;
  const n0 = mails().length;
  const unknown = await api("/auth/forgot", { method: "POST", body: { email: "inconnu@geonex.test" } });
  assert.deepEqual(unknown.data, { ok: true });
  assert.equal(mails().length, n0, "aucun e-mail pour une adresse inconnue, mais la même réponse");
  const known = await api("/auth/forgot", { method: "POST", body: { email: "alice@geonex.test" } });
  assert.deepEqual(known.data, { ok: true });
  assert.equal(mails().length, n0 + 1);
  await api("/auth/forgot", { method: "POST", body: { email: "alice@geonex.test" } });
  assert.equal(mails().length, n0 + 1, "pas de renvoi dans la minute (anti-abus)");
  const mail = lastMail("alice@geonex.test");
  assert.equal(mail.subject, "GEONEX — Réinitialisation de votre mot de passe");
  assert.doesNotMatch(mail.text, new RegExp(PW), "le mot de passe n'est jamais envoyé");
  const token = tokenOf(mail);
  const NEW = "nouveau-secret-42";
  assert.equal((await api("/auth/reset", { method: "POST", body: { token, password: "court", passwordConfirm: "court" } })).status, 400);
  assert.equal((await api("/auth/reset", { method: "POST", body: { token, password: NEW, passwordConfirm: NEW } })).status, 201);
  assert.equal((await api("/auth/reset", { method: "POST", body: { token, password: NEW, passwordConfirm: NEW } })).status, 400, "lien non réutilisable");
  assert.equal((await api("/auth/me", { token: people.Alice.token })).status, 401, "les anciennes sessions sont révoquées");
  assert.equal((await api("/auth/login", { method: "POST", body: { email: "alice@geonex.test", password: PW } })).status, 401);
  const ok = await api("/auth/login", { method: "POST", body: { email: "alice@geonex.test", password: NEW } });
  assert.equal(ok.status, 201);
  people.Alice.token = ok.data.token;
});

test("profil : pseudonyme, préférences, changement d'adresse vérifié, mot de passe", async () => {
  const { api } = stack;
  const bob = await user("bob@geonex.test", "Bob");
  const conflict = await api("/auth/profile", { method: "PATCH", token: bob.token, body: { pseudonym: "alice" } });
  assert.equal(conflict.status, 409);
  const p = await api("/auth/profile", { method: "PATCH", token: bob.token, body: { pseudonym: "Bob.Stratege", avatarColor: "brass", notifications: { invitations: false } } });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.equal(p.data.user.displayName, "Bob.Stratege");
  assert.equal(p.data.user.avatarColor, "brass");
  assert.equal(p.data.user.notifications.invitations, false);
  bob.token = p.data.token;

  assert.equal((await api("/auth/email", { method: "POST", token: bob.token, body: { email: "bob2@geonex.test", password: "mauvais-mot-de-passe9" } })).status, 401);
  assert.equal((await api("/auth/email", { method: "POST", token: bob.token, body: { email: "alice@geonex.test", password: PW } })).status, 409);
  assert.equal((await api("/auth/email", { method: "POST", token: bob.token, body: { email: "bob2@geonex.test", password: PW } })).status, 201);
  assert.equal((await api("/auth/me", { token: bob.token })).data.email, "bob@geonex.test", "l'adresse ne change qu'après vérification");
  await api("/auth/verify", { method: "POST", body: { token: tokenOf(lastMail("bob2@geonex.test")) } });
  assert.equal((await api("/auth/me", { token: bob.token })).data.email, "bob2@geonex.test");

  const changed = await api("/auth/password", { method: "POST", token: bob.token, body: { current: PW, next: "autre-secret-77" } });
  assert.equal(changed.status, 201);
  assert.equal((await api("/auth/me", { token: bob.token })).status, 401, "ancien jeton révoqué");
  assert.equal((await api("/auth/me", { token: changed.data.token })).status, 200, "l'appareil courant reste connecté");
  const all = await api("/auth/logout-all", { method: "POST", token: changed.data.token });
  assert.equal((await api("/auth/me", { token: changed.data.token })).status, 401);
  assert.equal((await api("/auth/me", { token: all.data.token })).status, 200);
});

test("invitations par pseudonyme, par lien et par e-mail ; participations et sessions en cours", { timeout: 120000 }, async () => {
  const { api } = stack;
  const alice = people.Alice;
  const carl = await user("carl@geonex.test", "Carl");
  const dana = await user("dana@geonex.test", "Dana");
  const erin = await user("erin@geonex.test", "Erin");
  const scenarioId = await scenarioFor(alice.token);
  alice.scenarioId = scenarioId;
  const s = await lobby(alice.token, scenarioId);
  alice.sessionId = s.sessionId;
  const inv = (token, body) => api(`/space/sessions/${s.sessionId}/invitations`, { method: "POST", token, body });

  assert.equal((await inv(carl.token, { pseudonym: "Dana" })).status, 403, "seul l'organisateur invite");
  assert.equal((await inv(alice.token, { pseudonym: "Fantome" })).status, 404, "pseudonyme inconnu");
  assert.equal((await inv(alice.token, {})).status, 400);
  const byName = await inv(alice.token, { pseudonym: "carl" });
  assert.equal(byName.status, 201, JSON.stringify(byName.data));
  assert.equal((await inv(alice.token, { pseudonym: "Carl" })).status, 409, "pas de doublon");

  let space = (await api("/space/overview", { token: carl.token })).data;
  assert.equal(space.invitations.length, 1);
  assert.equal(space.invitations[0].status, "pending");
  assert.equal(space.invitations[0].session.name, "Essai Atlas");
  assert.equal(space.invitations[0].from, "Alice");
  assert.ok(space.notifications.some((n) => n.kind === "invitation_received"));
  assert.equal(space.participations.length, 0);
  assert.equal((await api(`/space/invitations/${byName.data.id}/accept`, { method: "POST", token: dana.token })).status, 404, "une invitation n'est acceptable que par son destinataire");
  const acc = await api(`/space/invitations/${byName.data.id}/accept`, { method: "POST", token: carl.token });
  assert.equal(acc.status, 201, JSON.stringify(acc.data));
  assert.equal(acc.data.sessionId, s.sessionId);
  space = (await api("/space/overview", { token: carl.token })).data;
  assert.equal(space.participations.length, 1);
  assert.equal(space.participations[0].organizer, "Alice");
  assert.equal(space.active.length, 1, "la session figure dans les sessions en cours");
  assert.equal(space.active[0].relation, "Participant");
  assert.equal(space.invitations[0].status, "accepted");
  const mine = (await api("/space/overview", { token: alice.token })).data;
  assert.equal(mine.mySessions.length, 1);
  assert.match(mine.mySessions[0].code, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/, "le code est visible de l'organisateur");
  assert.equal(mine.mySessions[0].participants, 2);
  assert.ok(mine.notifications.some((n) => n.kind === "invitation_accepted"));
  assert.equal((await api("/space/overview", { token: dana.token })).data.mySessions.length, 0, "chacun ne voit que ses propres données");

  // lien d'invitation
  const link = await inv(alice.token, { link: true });
  assert.equal(link.status, 201);
  const lt = link.data.link.split("token=")[1];
  const prev = await api(`/invitations/link/${lt}`);
  assert.equal(prev.data.valid, true);
  assert.equal(prev.data.from, "Alice");
  assert.equal((await api(`/invitations/link/${lt}/accept`, { method: "POST" })).status, 401, "connexion requise");
  assert.equal((await api(`/invitations/link/${lt}/accept`, { method: "POST", token: dana.token })).status, 201);
  assert.equal((await api(`/invitations/link/${lt}/accept`, { method: "POST", token: erin.token })).status, 409, "session complète : le code et les invitations obéissent aux mêmes règles");
  assert.equal((await api("/invitations/link/inconnu-inconnu-inconnu")).status, 404);

  // révocation
  const l2 = await inv(alice.token, { link: true });
  const t2 = l2.data.link.split("token=")[1];
  assert.equal((await api(`/space/sessions/${s.sessionId}/invitations/${l2.data.id}`, { method: "DELETE", token: carl.token })).status, 403);
  assert.equal((await api(`/space/sessions/${s.sessionId}/invitations/${l2.data.id}`, { method: "DELETE", token: alice.token })).status, 200);
  assert.equal((await api(`/invitations/link/${t2}`)).data.valid, false);
  assert.equal((await api(`/invitations/link/${t2}/accept`, { method: "POST", token: erin.token })).status, 409);
  const list = (await api(`/space/sessions/${s.sessionId}/invitations`, { token: alice.token })).data;
  assert.ok(list.some((i) => i.status === "revoked") && list.some((i) => i.status === "accepted"));

  // e-mail : sans fournisseur réel, rien n'est annoncé comme envoyé et l'organisateur reçoit le lien
  const em = await inv(alice.token, { email: "eve@geonex.test" });
  assert.equal(em.status, 201, JSON.stringify(em.data));
  assert.equal(em.data.mail, "skipped");
  assert.ok(em.data.link);
  const invMail = lastMail("eve@geonex.test");
  assert.match(invMail.subject, /Alice vous invite/);
  assert.match(invMail.html, /REJOINDRE LA SIMULATION/);

  // archivage (aucune suppression)
  assert.equal((await api(`/space/sessions/${s.sessionId}/archive`, { method: "POST", token: carl.token })).status, 403);
  await api(`/space/sessions/${s.sessionId}/archive`, { method: "POST", token: alice.token });
  assert.equal((await api("/space/overview", { token: alice.token })).data.mySessions[0].status.key, "archived");
  await api(`/space/sessions/${s.sessionId}/unarchive`, { method: "POST", token: alice.token });
});

test("bibliothèque : filtres de données réelles, favoris persistants, privé par défaut, publication modérée", async () => {
  const { api } = stack;
  const alice = people.Alice, carl = people.Carl;
  const anon = await api("/library");
  assert.equal(anon.status, 200);
  const keys = anon.data.items.map((i) => i.key);
  for (const k of ["cuba-1962", "egypte-1799", "cent-ans-1415", "taiwan"]) assert.ok(keys.includes(k), k);
  assert.ok(anon.data.items.every((i) => i.source === "official"), "aucun scénario privé pour un visiteur");
  const cuba = anon.data.items.find((i) => i.key === "cuba-1962");
  assert.equal(cuba.eraGroup, "Guerre froide");
  assert.equal(cuba.regionGroup, "Amériques");
  assert.equal(anon.data.items.find((i) => i.key === "cent-ans-1415").regionGroup, "Europe");
  assert.equal(anon.data.items.find((i) => i.key === "taiwan").regionGroup, "Asie");
  assert.equal(anon.data.items.find((i) => i.key === "taiwan").complexity, "Avancé");
  assert.ok(!/secret|objective|red_line/i.test(JSON.stringify(anon.data)), "aucune donnée privée dans la bibliothèque");

  // favoris
  assert.equal((await api("/library/favorite", { method: "POST", body: { key: "cuba-1962", on: true } })).status, 401);
  assert.equal((await api("/library/favorite", { method: "POST", token: alice.token, body: { key: "n-existe-pas", on: true } })).status, 404);
  await api("/library/favorite", { method: "POST", token: alice.token, body: { key: "cuba-1962", on: true } });
  await api("/library/favorite", { method: "POST", token: alice.token, body: { key: "cuba-1962", on: true } }); // sans doublon
  assert.equal((await api("/library", { token: alice.token })).data.items.find((i) => i.key === "cuba-1962").favorite, true);
  assert.equal((await api("/library", { token: carl.token })).data.items.find((i) => i.key === "cuba-1962").favorite, false);
  assert.equal((await api("/space/overview", { token: alice.token })).data.favorites.length, 1);
  await api("/library/favorite", { method: "POST", token: alice.token, body: { key: "cuba-1962", on: false } });
  assert.equal((await api("/space/overview", { token: alice.token })).data.favorites.length, 0);

  // privé par défaut
  const sid = alice.scenarioId;
  const own = (await api("/library", { token: alice.token })).data.items.find((i) => i.key === `mine:${sid}`);
  assert.ok(own, "ses propres scénarios apparaissent pour son auteur");
  assert.equal((await api("/library", { token: carl.token })).data.items.some((i) => /^(mine|user):/.test(i.key)), false);

  // publication modérée
  const body = { title: "Détroit de Taïwan — essai", description: "Une crise à trois acteurs, jouable en équipes, pour s'entraîner à la négociation sous tension.", keywords: ["asie", "mer"] };
  assert.equal((await api(`/publications/${sid}`, { method: "POST", token: carl.token, body })).status, 404, "on ne publie pas le scénario d'un autre");
  assert.equal((await api(`/publications/${sid}`, { method: "POST", token: alice.token, body: { ...body, description: "trop court" } })).status, 400);
  const pub = await api(`/publications/${sid}`, { method: "POST", token: alice.token, body });
  assert.equal(pub.data.status, "pending");
  assert.equal((await api("/library")).data.items.some((i) => i.key === `user:${sid}`), false, "rien de public avant validation");
  const boss = await user("boss@geonex.test", "Boss");
  assert.equal((await api("/auth/me", { token: boss.token })).data.role, "owner", "administrateur désigné par l'adresse configurée sur le serveur");
  assert.equal((await api("/admin/moderation/pending", { token: carl.token })).status, 403);
  const pend = (await api("/admin/moderation/pending", { token: boss.token })).data;
  assert.equal(pend.length, 1);
  assert.equal((await api(`/admin/moderation/pending/${sid}`, { method: "POST", token: boss.token, body: { approve: true } })).status, 201);
  const pubItem = (await api("/library")).data.items.find((i) => i.key === `user:${sid}`);
  assert.ok(pubItem);
  assert.equal(pubItem.author, "Alice");
  assert.equal(pubItem.title, body.title);
  assert.equal((await api("/library/favorite", { method: "POST", token: carl.token, body: { key: `user:${sid}`, on: true } })).status, 201);
  const fork = await api(`/library/fork/${sid}`, { method: "POST", token: carl.token });
  assert.equal(fork.status, 201);
  assert.ok((await api("/library", { token: carl.token })).data.items.some((i) => i.key === `mine:${fork.data.scenarioId}`), "copie privée pour commencer une simulation");
  assert.equal((await api("/library/report", { method: "POST", token: carl.token, body: { key: `user:${sid}`, reason: "Test de signalement" } })).status, 201);
  assert.equal((await api("/admin/moderation/reports", { token: boss.token })).data.length, 1);
  // retrait
  assert.equal((await api(`/publications/${sid}`, { method: "DELETE", token: alice.token })).status, 200);
  assert.equal((await api("/library")).data.items.some((i) => i.key === `user:${sid}`), false);
  assert.equal((await api("/space/overview", { token: carl.token })).data.favorites.some((f) => f.key === `user:${sid}`), false, "favoris nettoyés");
});

test("suppression de compte : mot de passe exigé, données des autres participants protégées", async () => {
  const { api } = stack;
  const alice = people.Alice, carl = people.Carl;
  assert.equal((await api("/auth/me", { method: "DELETE", token: alice.token, body: { password: "mauvais-mot-de-passe9" } })).status, 401);
  assert.equal((await api("/auth/me", { method: "DELETE", token: alice.token, body: { password: "nouveau-secret-42" } })).status, 200);
  assert.equal((await api("/auth/me", { token: alice.token })).status, 401);
  assert.equal((await api("/auth/login", { method: "POST", body: { email: "alice@geonex.test", password: "nouveau-secret-42" } })).status, 401);
  const carlSpace = (await api("/space/overview", { token: carl.token })).data;
  assert.equal(carlSpace.participations.length, 0, "la session en attente de l'organisateur supprimé disparaît ; aucune partie jouée n'est détruite");
  assert.equal((await reg("alice2@geonex.test", "Alice")).status, 201, "le pseudonyme libéré peut être reprix");
});
