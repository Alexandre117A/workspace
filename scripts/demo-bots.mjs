#!/usr/bin/env node
// MODE DÉMONSTRATION — participants de test automatisés (outil de développement).
// Ces « bots » utilisent l'API publique comme de vrais joueurs ; ils ne font pas
// partie du fonctionnement de production et ne remplacent aucune intégration.
//
//   node scripts/demo-bots.mjs join XXXXX-XXXXX 2        → 2 équipes de test rejoignent une session
//   node scripts/demo-bots.mjs host "Crise Chine–Taïwan" 3 → crée une session (Président de test),
//                                                           attend 3 équipes (vous + bots) puis lance
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { io } = require("socket.io-client");
const API = process.env.GEONEX_API ?? "http://localhost:4000";
const [mode, arg, countRaw] = process.argv.slice(2);
const count = Number(countRaw ?? 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body, token) {
  const res = await fetch(`${API}/api${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

function connect(token, sessionId, label, { president = false, consent = true } = {}) {
  const s = io(`${API}/game`, { auth: { token, sessionId }, transports: ["websocket"] });
  const st = { runtime: null, view: null, requests: [], did: new Set(), invites: [] };
  const emit = (e, p) => new Promise((r) => s.emit(e, p, r));
  const once = (k) => (st.did.has(k) ? false : (st.did.add(k), true));
  s.on("state", (x) => { st.runtime = x.runtime ?? st.runtime; st.view = x.view ?? st.view; });
  s.on("runtime", (r) => { st.runtime = r; });
  s.on("view", (v) => { st.view = v; });
  s.on("requests", (r) => { st.requests = r; });
  s.on("invite", (i) => st.invites.push(i));
  s.on("rome", () => setTimeout(() => emit("rome:ack"), 2500));
  s.on("last_round", (e) => console.log(`[${label}] DERNIER ROUND — ${e.message}`));
  s.on("ended", () => { console.log(`[${label}] partie terminée`); setTimeout(() => process.exit(0), 1500); });
  const tick = async () => {
    const rt = st.runtime;
    if (!rt || rt.status === "finished") return;
    const me = st.view?.me?.id;
    const key = `${rt.round}:${rt.phase}`;
    if (president) {
      if (process.env.DEMO_ROME === "1" && rt.round === 2 && rt.phase === "diplomacy" && !rt.overlay && once("rome")) {
        await sleep(4000);
        const prop = await emit("president:rome_propose", { text: "Un pétrolier est arraisonné dans le détroit et son équipage retenu, provoquant une crise maritime." });
        if (prop.ok && prop.data.coherent) await emit("president:rome_confirm", { id: prop.data.draft.id, confirm: true });
        console.log("[président] communiqué proposé", prop.ok ? prop.data.coherent : prop.error);
      }
      for (const r of st.requests.filter((x) => x.status === "pending")) if (once(`rule:${r.id}`)) {
        await sleep(1500);
        await emit("president:rule", { requestId: r.id, approve: true, probability: 0.5 });
      }
      return;
    }
    if (["dossier", "briefing", "consequences"].includes(rt.phase) && once(key)) { await sleep(2500); await emit("ready"); }
    const a = rt.assembly;
    if (rt.phase === "assembly" && a?.speaker === me && ["speech", "rebuttal"].includes(a.mode) && once(`${key}:${a.mode}:${a.deadline}`)) {
      await sleep(1500);
      await emit("assembly:statement", { text: `${st.view.me.name} appelle à la retenue et réaffirme ses lignes rouges.` });
      await sleep(2500);
      await emit("assembly:end");
    }
    if (rt.phase === "diplomacy") {
      for (const inv of st.invites.filter((i) => i.to === me && !i.response)) if (once(`inv:${inv.id}`)) await emit("diplomacy:respond", { inviteId: inv.id, accept: true });
      const call = rt.calls?.find((c) => c.a === me || c.b === me);
      if (call && once(`call:${call.id}`)) {
        await sleep(1200);
        await emit("diplomacy:message", { text: "Nous sommes prêts à un accord de non-agression si vous retirez vos unités avancées." });
      }
      if (!call && once(`${key}:done`)) { await sleep(6000); await emit("diplomacy:done"); }
    }
    if (rt.phase === "decisions" && once(key) && st.view?.me) {
      await sleep(3000);
      const other = st.view.actors.find((x) => x.controlled_by === "human" && x.id !== me) ?? st.view.actors.find((x) => x.id !== me);
      await emit("decisions:submit", { decisions: [{ id: `b${rt.round}`, category: rt.round % 2 ? "diplomatic_initiative" : "sanctions", targets: [other.id], intent: "Décision d'un participant de test", allocation: { political: 4, economic: rt.round % 2 ? 0 : 4, military: 0 } }] });
    }
  };
  setInterval(() => tick().catch((e) => console.error(label, e.message)), 400);
  s.on("connect", () => console.log(`[${label}] connecté`));
  return { socket: s, st, emit };
}

async function main() {
  if (mode === "join") {
    for (let i = 0; i < count; i++) {
      const { token } = await api("/auth/guest", { displayName: `Équipe de test ${i + 1}` });
      const { sessionId } = await api("/sessions/join", { code: arg }, token);
      await api(`/sessions/${sessionId}/consent`, { consent: true }, token);
      connect(token, sessionId, `bot${i + 1}`);
    }
    console.log(`${count} équipe(s) de test dans la session ${arg}.`);
  } else if (mode === "host") {
    const { token } = await api("/auth/guest", { displayName: "Président de test" });
    const { jobId } = await api("/scenarios/jobs", { mode: "contemporary", prompt: arg, players: count }, token);
    let job;
    do { await sleep(800); job = await api(`/scenarios/jobs/${jobId}`, undefined, token); } while (!["done", "failed"].includes(job.status));
    if (job.status === "failed") throw new Error(job.error);
    const { sessionId, code } = await api("/sessions", { scenarioId: job.scenarioId, teams: count, durationMinutes: 45 }, token);
    console.log(`SESSION ${sessionId} — CODE ${code}`);
    const pres = connect(token, sessionId, "président", { president: true });
    const bots = Number(process.argv[5] ?? 0);
    for (let i = 0; i < bots; i++) {
      const g = await api("/auth/guest", { displayName: `Équipe de test ${i + 1}` });
      await api("/sessions/join", { code }, g.token);
      connect(g.token, sessionId, `bot${i + 1}`);
    }
    for (;;) {
      const lobby = await api(`/sessions/${sessionId}`, undefined, token);
      const teams = lobby.participants.filter((p) => p.role === "team" && p.connected).length;
      if (teams >= count) break;
      await sleep(1500);
    }
    await sleep(1500);
    await api(`/sessions/${sessionId}/start`, {}, token);
    console.log("Partie lancée.");
    void pres;
  } else {
    console.log("Usage : node scripts/demo-bots.mjs join <code> [n] | host <prompt> <équipes> [bots]");
    process.exit(1);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
