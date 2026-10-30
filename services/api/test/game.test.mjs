// Parcours complet multijoueur : création d'une simulation, lobby, attribution des équipes,
// rounds complets (Assemblée, Diplomatie, Décisions, Arbitrage), carte stratégique,
// Communiqué de Rome, déconnexion/reconnexion, fin de partie et archive.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { startStack, sleep, waitFor } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { io } = require("socket.io-client");

let stack;
before(async () => {
  stack = await startStack({ timeScale: 0.05, owners: "owner@geonex.test" });
});
after(async () => {
  await stack?.stop();
});

function client(base, token, sessionId, name) {
  const c = { name, events: [], state: null, runtime: null, view: null, messages: [], romes: [], reports: [], invites: [], ended: null, lastRound: null, requests: [] };
  const socket = io(base + "/game", { auth: { token, sessionId }, transports: ["websocket"], reconnection: false });
  c.socket = socket;
  socket.on("state", (s) => { c.state = s; c.runtime = s.runtime ?? c.runtime; c.view = s.view ?? c.view; });
  socket.on("runtime", (r) => { c.runtime = r; });
  socket.on("view", (v) => { c.view = v; });
  socket.on("message", (m) => c.messages.push(m));
  socket.on("rome", (r) => c.romes.push(r));
  socket.on("report", (r) => c.reports.push(r));
  socket.on("invite", (i) => c.invites.push(i));
  socket.on("ended", (e) => { c.ended = e; });
  socket.on("last_round", (e) => { c.lastRound = e; });
  socket.on("requests", (r) => { c.requests = r; });
  socket.on("lobby", (l) => c.events.push(["lobby", l]));
  c.emit = (event, payload) => new Promise((res) => socket.emit(event, payload, res));
  c.connected = () => new Promise((res, rej) => { if (socket.connected) res(); socket.once("connect", res); socket.once("connect_error", rej); });
  return c;
}

test("auth, rôles et administration", async () => {
  const { api } = stack;
  const reg = await api("/auth/register", { method: "POST", body: { email: "joueur@geonex.test", pseudonym: "Joueur", password: "motdepasse-solide9", passwordConfirm: "motdepasse-solide9", acceptTerms: true } });
  assert.equal(reg.status, 201);
  const bad = await api("/auth/login", { method: "POST", body: { email: "joueur@geonex.test", password: "mauvais-mot-de-passe" } });
  assert.equal(bad.status, 401);
  const forbidden = await api("/admin/overview", { token: reg.data.token });
  assert.equal(forbidden.status, 403);
  const owner = await api("/auth/register", { method: "POST", body: { email: "owner@geonex.test", pseudonym: "Proprio", password: "motdepasse-solide9", passwordConfirm: "motdepasse-solide9", acceptTerms: true } });
  assert.equal(owner.data.user.role, "owner");
  const ok = await api("/admin/overview", { token: owner.data.token });
  assert.equal(ok.status, 200);
  const cfg = await api("/config");
  assert.equal(cfg.data.features.ads, false);
  assert.equal(cfg.data.features.ai, false);
  assert.equal(cfg.data.minDurationMinutes, 30);
});

test("catalogue public des scénarios : métadonnées réelles, sans secret", async () => {
  const { api } = stack;
  const r = await api("/catalog");
  assert.equal(r.status, 200);
  const ids = r.data.scenarios.map((s) => s.id);
  for (const id of ["cuba-1962", "egypte-1799", "cent-ans-1415", "taiwan"]) assert.ok(ids.includes(id), `fiche manquante : ${id}`);
  for (const s of r.data.scenarios) {
    assert.ok(s.actors.length && s.zones.length && s.summary && s.theatre.name, s.id);
    assert.ok(!/secrets|red_lines|objectives/.test(JSON.stringify(s)), "le catalogue ne doit exposer aucune donnée privée");
  }
  const medieval = r.data.scenarios.find((s) => s.id === "cent-ans-1415");
  assert.equal(medieval.theatre.basemap, "land");
});

test("parcours complet d'une partie à trois équipes", { timeout: 240000 }, async () => {
  const { api, base } = stack;
  const pres = (await api("/auth/guest", { method: "POST", body: { displayName: "Présidente" } })).data;
  const players = [];
  for (const n of ["Alpha", "Bravo", "Charlie", "Delta"]) players.push((await api("/auth/guest", { method: "POST", body: { displayName: n } })).data);

  // ---- création de la simulation (préparation réelle par le moteur, progression suivie)
  const job = await api("/scenarios/jobs", { method: "POST", token: pres.token, body: { mode: "contemporary", prompt: "Crise Chine–Taïwan", players: 3 } });
  assert.equal(job.status, 201, JSON.stringify(job.data));
  const done = await waitFor(async () => {
    const j = (await api(`/scenarios/jobs/${job.data.jobId}`, { token: pres.token })).data;
    return j.status === "done" || j.status === "failed" ? j : null;
  }, { label: "préparation du scénario" });
  assert.equal(done.status, "done", JSON.stringify(done));
  const scenario = (await api(`/scenarios/${done.scenarioId}`, { token: pres.token })).data;
  assert.ok(scenario.actors.length >= 6);
  assert.ok(!JSON.stringify(scenario).includes("objectives"), "la vue scénario ne doit pas exposer les objectifs");

  // ---- durée minimale et session privée
  const tooShort = await api("/sessions", { method: "POST", token: pres.token, body: { scenarioId: done.scenarioId, teams: 3, durationMinutes: 20 } });
  assert.equal(tooShort.status, 400);
  const created = await api("/sessions", { method: "POST", token: pres.token, body: { scenarioId: done.scenarioId, teams: 3, durationMinutes: 60 } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const { sessionId, code } = created.data;
  assert.match(code, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

  // ---- rejoindre : code invalide, doublon, session complète
  assert.equal((await api("/sessions/join", { method: "POST", token: players[0].token, body: { code: "AAAAA-AAAAA" } })).status, 404);
  for (const p of players.slice(0, 3)) {
    const r = await api("/sessions/join", { method: "POST", token: p.token, body: { code } });
    assert.equal(r.status, 201);
    assert.equal(r.data.sessionId, sessionId);
  }
  const again = await api("/sessions/join", { method: "POST", token: players[0].token, body: { code: code.toLowerCase() } });
  assert.equal(again.data.rejoined, true);
  assert.equal((await api("/sessions/join", { method: "POST", token: players[3].token, body: { code } })).status, 409);
  for (const p of players.slice(0, 2)) await api(`/sessions/${sessionId}/consent`, { method: "POST", token: p.token, body: { consent: true } });

  // ---- lobby temps réel
  const P = client(base, pres.token, sessionId, "president");
  const T = players.slice(0, 3).map((p, i) => client(base, p.token, sessionId, `team${i}`));
  await Promise.all([P, ...T].map((c) => c.connected()));
  await waitFor(() => P.state?.participants?.length === 4 && P.state.participants.filter((x) => x.connected).length >= 1, { label: "lobby" });
  assert.equal(P.state.me.role, "president");
  assert.equal(P.state.session.expectedTeams, 3);
  const outsider = client(base, players[3].token, sessionId, "outsider");
  await waitFor(() => outsider.socket.disconnected, { label: "refus d'un non-participant" });

  // ---- lancement : attribution des équipes et dossiers confidentiels
  const started = await api(`/sessions/${sessionId}/start`, { method: "POST", token: players[0].token });
  assert.equal(started.status, 403, "seul le Président lance la partie");
  assert.equal((await api(`/sessions/${sessionId}/start`, { method: "POST", token: pres.token })).status, 201);
  await waitFor(() => T.every((c) => c.view?.me), { label: "vues d'équipe" });
  for (const c of T) await c.emit("sync");
  await waitFor(() => T.every((c) => c.state?.dossier?.objectives?.length), { label: "dossiers" });
  const actors = T.map((c) => c.view.me.id);
  assert.equal(new Set(actors).size, 3);
  for (const c of T) {
    assert.ok(c.state.dossier.capitals && c.state.dossier.red_lines.length);
    for (const o of T) {
      if (o === c) continue;
      const mine = new Set(c.view.me.objectives.map((x) => x.text));
      for (const obj of o.view.me.objectives) if (!mine.has(obj.text)) assert.ok(!JSON.stringify(c.view).includes(obj.text), "fuite d'objectif");
      for (const s of o.view.me.secrets) assert.ok(!JSON.stringify(c.view).includes(s) || c.view.me.secrets.includes(s), "fuite de secret");
    }
  }
  assert.ok(P.view.true_balance, "le Président voit le rapport de force réel");
  assert.equal(T[0].view.balance, null, "rapport de force verrouillé pour les équipes");

  // ---- bots : chaque client réagit aux phases comme un joueur
  const did = new Set();
  const once = (key) => (did.has(key) ? false : (did.add(key), true));
  let stop = false;
  let reconnectDone = false;
  const ids = () => T.map((c) => c.view?.me?.id);
  async function step(c, i) {
    const rt = c.runtime;
    if (!rt || rt.status === "finished") return;
    const me = c.view?.me?.id;
    const key = `${rt.round}:${rt.phase}:${i}`;
    if (rt.overlay && c.romes.length && once(`rome:${rt.overlay.id}:${i}`)) await c.emit("rome:ack");
    if (rt.paused) return;
    if (["dossier", "briefing", "consequences"].includes(rt.phase) && once(key)) await c.emit("ready");
    if (rt.phase === "assembly" && rt.assembly) {
      const a = rt.assembly;
      if (a.speaker === me && ["speech", "rebuttal"].includes(a.mode) && once(`${key}:${a.mode}:${a.deadline}`)) {
        const r = await c.emit("assembly:statement", { text: `Déclaration de ${me} : nous appelons au calme.` });
        assert.ok(r.ok, r.error);
        await c.emit("assembly:end");
      }
      if (a.mode === "reaction" && i === 1 && a.speaker !== me && once(`${key}:floor:${a.deadline}`)) await c.emit("assembly:floor");
    }
    if (rt.phase === "diplomacy") {
      if (i === 0 && once(`${key}:invite`)) {
        const r = await c.emit("diplomacy:invite", { target: ids()[1] });
        assert.ok(r.ok, r.error);
      }
      if (i === 1) for (const inv of c.invites.filter((x) => !x.response && x.to === me)) if (once(`acc:${inv.id}`)) await c.emit("diplomacy:respond", { inviteId: inv.id, accept: true });
      const call = rt.calls?.[0];
      if (call && i === 0 && once(`${key}:msg`)) await c.emit("diplomacy:message", { text: "Nous nous engageons à ne pas vous attaquer : pacte de non-agression." });
      if (call && i === 1 && once(`${key}:reply`)) {
        await sleep(30);
        await c.emit("diplomacy:message", { text: "Accord conclu, nous soutiendrons votre position." });
        await sleep(30);
        await c.emit("diplomacy:hangup", { callId: call.id });
      }
      if (i === 2 && rt.round === 2 && !reconnectDone && once("reconnect")) {
        c.socket.disconnect();
        reconnectDone = "pending";
        return;
      }
      const talked = did.has(`${rt.round}:diplomacy:1:reply`) && !rt.calls?.length;
      if ((i === 2 || talked) && !rt.calls?.length && once(`${key}:done`)) {
        await sleep(i === 2 ? 0 : 60);
        await c.emit("diplomacy:done");
      }
    }
    if (rt.phase === "decisions" && once(key)) {
      if (i === 2 && rt.round === 2) {
        const card = await c.emit("card:submit", { card: "political_shock", payload: { target: ids()[0], intent: "Provoquer une crise de gouvernement", invest: { political: 5 } } });
        assert.ok(card.ok, card.error);
        const est = await c.emit("card:estimate", { target: ids()[0] });
        assert.equal(est.data.estimate, 0.3, "estimation initiale de 30 % sans renseignement");
      }
      const decisions = i === 0
        ? [{ id: `s${rt.round}`, category: "military_strike", targets: [ids()[1]], intent: "Frappe limitée", allocation: { political: 0, economic: 0, military: 6 } }]
        : i === 1
          ? [{ id: `d${rt.round}`, category: "diplomatic_initiative", targets: [ids()[2]], intent: "Médiation", allocation: { political: 5, economic: 0, military: 0 } }]
          : [{ id: `p${rt.round}`, category: "domestic_policy", targets: [], intent: "Stabiliser", allocation: { political: 0, economic: 5, military: 0 } }];
      const bad = await c.emit("decisions:submit", { decisions: [{ ...decisions[0], allocation: { political: 0, economic: 0, military: 999 } }] });
      assert.equal(bad.ok, false, "allocation hors bornes refusée");
      const r = await c.emit("decisions:submit", { decisions });
      assert.ok(r.ok, r.error);
    }
  }
  async function presidentStep() {
    const rt = P.runtime;
    if (!rt || rt.status === "finished") return;
    if (rt.overlay && P.romes.length && once(`rome:${rt.overlay.id}:P`)) await P.emit("rome:ack");
    if (["arbitration", "decisions"].includes(rt.phase)) {
      for (const req of P.requests.filter((r) => r.status === "pending")) if (once(`rule:${req.id}`)) {
        const r = await P.emit("president:rule", { requestId: req.id, approve: true, probability: 0.5 });
        assert.ok(r.ok, r.error);
      }
    }
    if (rt.round === 2 && rt.phase === "diplomacy" && !rt.overlay && once("manual-rome")) {
      const prop = await P.emit("president:rome_propose", { text: "Un pétrolier est arraisonné dans le détroit, provoquant une crise maritime majeure." });
      assert.ok(prop.ok && prop.data.coherent, JSON.stringify(prop));
      assert.ok(prop.data.draft.body.length > 20);
      const conf = await P.emit("president:rome_confirm", { id: prop.data.draft.id, confirm: true });
      assert.ok(conf.ok, conf.error);
    }
  }
  const loop = (async () => {
    while (!stop) {
      await Promise.all([...T.map((c, i) => (c.socket.connected ? step(c, i) : null)), presidentStep()]);
      if (reconnectDone === "pending") {
        await sleep(100);
        const old = T[2];
        const fresh = client(base, players[2].token, sessionId, "team2-reconnected");
        await fresh.connected();
        await waitFor(() => fresh.state?.view?.me, { label: "resynchronisation" });
        assert.equal(fresh.state.me.actorId, old.view.me.id, "le joueur retrouve son équipe");
        assert.equal(fresh.state.view.me.id, old.view.me.id);
        fresh.romes = old.romes;
        T[2] = fresh;
        reconnectDone = true;
      }
      await sleep(25);
    }
  })();

  await waitFor(() => P.romes.length > 0, { timeout: 120000, label: "Communiqué de Rome" });
  const rome = P.romes[0];
  assert.ok(rome.title && rome.body && rome.general_impact);
  await waitFor(() => T.every((c) => c.romes.length > 0) || T.some((c) => !c.socket.connected), { label: "communiqué reçu par les équipes" });
  assert.ok(T[0].romes[0].mine !== undefined, "chaque équipe reçoit ses conséquences propres");
  await waitFor(() => P.runtime?.overlay === null && !P.runtime.paused, { label: "reprise après communiqué" });

  await waitFor(() => P.ended, { timeout: 200000, label: "fin de partie" });
  stop = true;
  await loop;

  // ---- confidentialité des communications privées
  const callMsgs = T[2].messages.filter((m) => String(m.channel).startsWith("call:") && !m.system);
  assert.equal(callMsgs.length, 0, "une équipe tierce ne reçoit jamais une communication privée");
  assert.ok(T[0].messages.some((m) => String(m.channel).startsWith("call:") && !m.system));
  assert.ok(T[1].messages.some((m) => m.channel === "assembly"), "les déclarations publiques sont diffusées à tous");
  assert.ok(T[0].reports.length >= 1 && T[0].reports[0].private.capital_changes, "rapport privé de fin de round");
  assert.ok(P.lastRound, "annonce du dernier round");
  assert.equal(P.lastRound.message, "C'est le moment de faire basculer la balance de votre côté.");

  // ---- archive, classement, export
  const arc = await api(`/archives/${sessionId}`, { token: players[0].token });
  assert.equal(arc.status, 200);
  assert.equal(arc.data.ranking.length, 3);
  assert.ok(arc.data.winner?.name);
  assert.equal(arc.data.ranking.filter((r) => r.qualification).length, 3);
  assert.ok(arc.data.timeline.length >= 2);
  assert.ok(arc.data.communiques.length >= 1);
  assert.ok(arc.data.cards.some((c) => c.card === "Choc politique"));
  assert.ok(arc.data.ignored.length >= 1);
  const html = await fetch(`${base}/api/archives/${sessionId}/report.html`, { headers: { authorization: `Bearer ${players[1].token}` } });
  assert.equal(html.status, 200);
  assert.match(await html.text(), /DÉCLASSIFIÉ/);
  assert.equal((await api(`/archives/${sessionId}`, { token: players[3].token })).status, 403);
  const late = await api("/sessions/join", { method: "POST", token: players[3].token, body: { code } });
  assert.equal(late.status, 410, "session terminée");
  for (const c of [P, ...T]) c.socket.disconnect();
});
