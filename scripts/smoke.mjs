#!/usr/bin/env node
// Vérification de bout en bout d'un GEONEX déployé : santé, site web, compte invité, préparation d'une simulation,
// création d'une session, connexion temps réel (WebSocket).
//   node scripts/smoke.mjs https://votre-service.onrender.com
// Crée un compte invité et une session de test (supprimés avec le temps par le serveur).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const base = (process.argv[2] ?? process.env.GEONEX_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (label, detail = "") => console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ""}`);
const ko = (label, detail = "") => { failures++; console.log(`  ✖ ${label}${detail ? ` — ${detail}` : ""}`); };

async function call(path, { method = "GET", body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* pas du JSON */ }
  return { status: res.status, data, type: res.headers.get("content-type") ?? "" };
}

console.log(`Vérification de ${base}`);
const t0 = Date.now();
try {
  const h = await call("/api/health");
  h.status === 200 && h.data?.status === "ok" ? ok("API", `${Date.now() - t0} ms`) : ko("API", `HTTP ${h.status}`);
  h.data?.engine?.status === "ok" ? ok("Moteur de simulation") : ko("Moteur de simulation", JSON.stringify(h.data?.engine));

  const page = await call("/");
  page.status === 200 && page.type.includes("text/html") && String(page.data).includes("GEONEX") ? ok("Site web (page d'accueil)") : ko("Site web", `HTTP ${page.status} ${page.type}`);
  const deep = await call("/credits");
  deep.status === 200 && deep.type.includes("text/html") ? ok("Navigation directe vers /credits") : ko("Navigation directe vers /credits", `HTTP ${deep.status}`);

  const cat = await call("/api/catalog");
  cat.status === 200 && Array.isArray(cat.data?.scenarios) && cat.data.scenarios.length >= 4 ? ok("Catalogue de scénarios", `${cat.data.scenarios.length} fiches`) : ko("Catalogue de scénarios", `HTTP ${cat.status}`);

  const g = await call("/api/auth/guest", { method: "POST", body: { displayName: `Test ${Date.now() % 10000}` } });
  const token = g.data?.token ?? g.data?.accessToken;
  token ? ok("Compte invité") : ko("Compte invité", `HTTP ${g.status} ${JSON.stringify(g.data).slice(0, 120)}`);

  if (token) {
    const job = await call("/api/scenarios/jobs", { method: "POST", token, body: { mode: "contemporary", prompt: "Crise Chine–Taïwan", name: "Test de déploiement", players: 3 } });
    const jobId = job.data?.id ?? job.data?.jobId;
    if (!jobId) ko("Préparation d'une simulation", `HTTP ${job.status} ${JSON.stringify(job.data).slice(0, 160)}`);
    else {
      let st, scenarioId;
      const t1 = Date.now();
      for (let i = 0; i < 120; i++) {
        st = await call(`/api/scenarios/jobs/${jobId}`, { token });
        if (st.data?.status === "done") { scenarioId = st.data.scenarioId; break; }
        if (st.data?.status === "failed") break;
        await sleep(500);
      }
      scenarioId ? ok("Préparation d'une simulation", `${((Date.now() - t1) / 1000).toFixed(1)} s`) : ko("Préparation d'une simulation", JSON.stringify(st?.data).slice(0, 160));
      if (scenarioId) {
        const s = await call("/api/sessions", { method: "POST", token, body: { scenarioId, teams: 3, durationMinutes: 60 } });
        const sid = s.data?.sessionId ?? s.data?.id;
        sid ? ok("Création d'une session", `code ${s.data?.code ?? "?"}`) : ko("Création d'une session", `HTTP ${s.status} ${JSON.stringify(s.data).slice(0, 160)}`);
        if (sid) {
          const { io } = require("socket.io-client");
          const connected = await new Promise((resolve) => {
            const socket = io(base + "/game", { auth: { token, sessionId: sid }, transports: ["websocket"], reconnection: false, timeout: 15_000 });
            socket.on("connect", () => { socket.close(); resolve(true); });
            socket.on("connect_error", (e) => { socket.close(); resolve(String(e?.message ?? e)); });
          });
          connected === true ? ok("Connexion temps réel (WebSocket)") : ko("Connexion temps réel (WebSocket)", String(connected));
        }
      }
    }
  }
} catch (e) {
  ko("Vérification interrompue", String(e?.message ?? e));
}
console.log(failures ? `\n${failures} vérification(s) en échec.` : "\nTout fonctionne.");
process.exit(failures ? 1 : 0);
