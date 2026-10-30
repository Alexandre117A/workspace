import { Controller, ForbiddenException, Get, Header, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthUser, CurrentUser } from "./auth";
import { Db } from "./db";
import { ScenariosService } from "./scenarios";
import { SessionsService } from "./sessions";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

@Injectable()
export class ArchivesService {
  constructor(private readonly db: Db, private readonly scenarios: ScenariosService, private readonly sessions: SessionsService) {}

  async list(user: AuthUser) {
    return this.db.query(
      `SELECT s.id, s.name, s.finished_at, s.duration_minutes, sc.mode, a.data->'winner' AS winner, a.data->>'rounds_played' AS rounds
       FROM participants p JOIN sessions s ON s.id = p.session_id JOIN archives a ON a.session_id = s.id JOIN scenarios sc ON sc.id = s.scenario_id
       WHERE p.user_id = $1 ORDER BY s.finished_at DESC`, [user.id]);
  }

  async get(user: AuthUser, sessionId: string) {
    const part = await this.db.one("SELECT * FROM participants WHERE session_id = $1 AND user_id = $2", [sessionId, user.id]);
    if (!part) throw new ForbiddenException("Archive réservée aux participants de la session.");
    const row = await this.db.one("SELECT a.data, s.name, s.started_at, s.finished_at, s.scenario_id, sc.mode FROM archives a JOIN sessions s ON s.id = a.session_id JOIN scenarios sc ON sc.id = s.scenario_id WHERE a.session_id = $1", [sessionId]);
    if (!row) throw new NotFoundException("Archive indisponible : la simulation n'est pas terminée.");
    const parts = await this.db.query("SELECT display_name, emblem, actor_id, role FROM participants WHERE session_id = $1", [sessionId]);
    return { ...row.data, sessionName: row.name, startedAt: row.started_at, finishedAt: row.finished_at, scenarioId: row.scenario_id, players: parts, me: { actorId: part.actor_id, role: part.role } };
  }

  /** Nouvelle simulation sur le même thème : jamais la même histoire.
   * Contemporain : contexte actualisé (nouvelle recherche). Sinon : nouvelle session, nouvelle graine. */
  async replay(user: AuthUser, sessionId: string) {
    const a = await this.get(user, sessionId);
    const sc = await this.db.one("SELECT * FROM scenarios WHERE id = $1", [a.scenarioId]);
    if (!sc) throw new NotFoundException();
    if (sc.mode === "contemporary") {
      const teams = (a.players as any[]).filter((p) => p.role === "team").length || 3;
      return { kind: "job", ...(await this.scenarios.createJob(user, { mode: "contemporary", prompt: sc.prompt, players: teams })) };
    }
    if (sc.owner_id !== user.id) throw new ForbiddenException("Seul le créateur du scénario peut le relancer.");
    const old = await this.db.one("SELECT expected_teams, duration_minutes FROM sessions WHERE id = $1", [sessionId]);
    return { kind: "session", ...(await this.sessions.create(user, { scenarioId: sc.id, teams: old!.expected_teams, durationMinutes: old!.duration_minutes })) };
  }

  /** Rapport complet au format « dossier déclassifié », imprimable en PDF. */
  async reportHtml(user: AuthUser, sessionId: string): Promise<string> {
    const a: any = await this.get(user, sessionId);
    const actorName = (id: string) => a.teams.find((t: any) => t.actor === id)?.name ?? id;
    const teams = a.teams.map((t: any) => `
      <section class="dossier"><h3>${esc(t.rank)}. ${esc(t.name)} <small>${esc(t.qualification ?? "")}</small></h3>
      <p>${esc(t.narrative)}</p>
      <table><tr><th>Objectif</th><th>Accomplissement</th></tr>${t.objectives.map((o: any) => `<tr><td>${esc(o.text)}</td><td>${Math.round(o.progress * 100)} %</td></tr>`).join("")}</table>
      <p class="caps">Capitaux finaux — politique ${esc(Math.round(t.final_capitals.political))} · économique ${esc(Math.round(t.final_capitals.economic))} · militaire ${esc(Math.round(t.final_capitals.military))}</p>
      ${t.cards.length ? `<p><b>Cartes :</b> ${t.cards.map((c: any) => esc(`${c.card} (round ${c.round}) — ${c.result?.summary ?? c.result?.report?.confidence_label ?? ""}`)).join(" ; ")}</p>` : ""}
      </section>`).join("");
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>GEONEX — ${esc(a.title)}</title>
<style>
@page { margin: 18mm; }
body { font-family: Georgia, "Times New Roman", serif; color: #1d1b16; background: #f4efe3; max-width: 820px; margin: 0 auto; padding: 32px; }
header { border-bottom: 3px double #6b1d1d; padding-bottom: 12px; margin-bottom: 24px; }
.stamp { display: inline-block; border: 2px solid #8a1f1f; color: #8a1f1f; padding: 4px 10px; font: 700 12px/1 "Courier New", monospace; letter-spacing: .25em; transform: rotate(-3deg); }
h1 { font-size: 30px; margin: 12px 0 4px; letter-spacing: .02em; } h2 { font: 700 13px "Courier New", monospace; letter-spacing: .2em; text-transform: uppercase; color: #6b1d1d; margin-top: 32px; border-top: 1px solid #bba98a; padding-top: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; } th, td { border-bottom: 1px solid #cdbf9f; padding: 5px 6px; text-align: left; }
.dossier { border-left: 3px solid #6b1d1d; padding-left: 14px; margin: 18px 0; page-break-inside: avoid; } small { color: #6b1d1d; font-weight: normal; }
.caps, .meta { font: 12px "Courier New", monospace; color: #4a4336; } .ignored li { margin-bottom: 6px; }
</style></head><body>
<header><span class="stamp">DÉCLASSIFIÉ — GEONEX</span><h1>${esc(a.title)}</h1>
<div class="meta">Rounds : ${esc(a.rounds_played)} · Temps simulé final : ${esc(a.sim_time_final)} · Président de séance : ${esc(a.meta?.president ?? "—")} · Durée réelle : ${Math.round((a.meta?.real_duration_seconds ?? 0) / 60)} min</div></header>
<h2>Résultat</h2>
<p><b>${esc(a.winner?.name ?? "—")}</b> — ${esc(a.winner?.qualification ?? "")} (indice ${esc(a.winner?.score ?? "—")}/100)</p>
<table><tr><th>Rang</th><th>Équipe</th><th>Indice</th><th>Objectifs /40</th><th>Position /20</th><th>Capitaux /15</th><th>Cohérence /15</th><th>Résilience /10</th></tr>
${a.ranking.map((r: any) => `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.total}</td><td>${r.components.objectives}</td><td>${r.components.position}</td><td>${r.components.capital_management}</td><td>${r.components.coherence}</td><td>${r.components.resilience}</td></tr>`).join("")}</table>
${a.mentions.length ? `<p>${a.mentions.map((m: any) => `<b>${esc(m.mention)}</b> — ${esc(actorName(m.actor))} : ${esc(m.reason)}`).join("<br>")}</p>` : ""}
<h2>Dossiers des équipes</h2>${teams}
<h2>Chronologie</h2>${a.timeline.map((r: any) => `<p><b>Round ${r.round} — ${esc(r.sim_time_label)}</b><br>${esc(r.narrative)}</p>`).join("")}
<h2>Communiqués de Rome</h2>${a.communiques.length ? a.communiques.map((c: any) => `<p><b>${esc(c.title)}</b> <span class="meta">(${esc(c.dateline)})</span><br>${esc(c.body)}<br><i>${esc(c.general_impact)}</i></p>`).join("") : "<p>Aucun communiqué.</p>"}
<h2>Ce que vous ignoriez</h2><ul class="ignored">${a.ignored.map((i: any) => `<li><b>${esc(i.type)}</b> — ${esc(i.text)}</li>`).join("")}</ul>
</body></html>`;
  }
}

@Controller("archives")
@UseGuards(AuthGuard)
export class ArchivesController {
  constructor(private readonly svc: ArchivesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.get(user, id);
  }

  @Get(":id/report.html")
  @Header("content-type", "text/html; charset=utf-8")
  report(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.reportHtml(user, id);
  }

  @Post(":id/replay")
  replay(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.replay(user, id);
  }
}
