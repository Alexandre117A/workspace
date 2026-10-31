import { Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { questionSchema, scenarioJobSchema } from "@geonex/shared";
import { z } from "zod";
import { AuthGuard, AuthService, AuthUser, CurrentUser } from "./auth";
import { Db } from "./db";
import { EngineClient } from "./engine.client";
import { parse, seedFromUuid } from "./util";

/** Vue publique d'un scénario : jamais d'objectifs, de secrets ni de lignes rouges
 * (le créateur peut ensuite participer à une session de ce scénario). */
export function publicScenario(row: any) {
  const d = row.data;
  return {
    id: row.id,
    mode: row.mode,
    title: row.title,
    summary: row.summary,
    prompt: row.prompt,
    createdAt: row.created_at,
    provider: row.provider,
    setting: { start_label: d.setting.start_label, era: d.setting.era, theatre: d.setting.theatre, camps: d.setting.camps, knowledge_cutoff: d.setting.knowledge_cutoff, tempo: d.setting.tempo },
    actors: d.actors.map((a: any) => ({ id: a.id, name: a.name, kind: a.kind, leader: a.leader, leader_status: a.leader_source?.status, camp: a.camp, relevance: a.relevance, iso_n3: a.iso_n3 })),
    zones: d.zones.map((z: any) => ({ id: z.id, name: z.name, domain: z.domain })),
    generation: { provider: d.generation.provider, notes: d.generation.notes, sources: d.generation.sources, duration_seconds: d.generation.duration_seconds },
  };
}

@Injectable()
export class ScenariosService {
  constructor(private readonly db: Db, private readonly engine: EngineClient, private readonly auth: AuthService) {}

  async createJob(user: AuthUser, input: unknown) {
    this.auth.assertVerified(user);
    const params = parse(scenarioJobSchema, input);
    const id = randomUUID();
    const { job_id } = await this.engine.post<{ job_id: string }>("/scenarios/jobs", { ...params, seed: seedFromUuid(id) });
    await this.db.query("INSERT INTO generation_jobs(id, owner_id, engine_job_id, params) VALUES ($1,$2,$3,$4)", [id, user.id, job_id, params]);
    await this.db.query("INSERT INTO usage_records(service, units, meta) VALUES ('scenario_generation', 1, $1)", [{ mode: params.mode }]);
    return { jobId: id };
  }

  async job(user: AuthUser, id: string) {
    const row = await this.db.one("SELECT * FROM generation_jobs WHERE id = $1 AND owner_id = $2", [id, user.id]);
    if (!row) throw new NotFoundException("Préparation introuvable.");
    if (row.status === "done") return { status: "done", progress: 1, scenarioId: row.scenario_id, steps: [] };
    if (row.status === "failed") return { status: "failed", progress: 0, error: row.error, steps: [] };
    let job: any;
    try {
      job = await this.engine.get(`/scenarios/jobs/${row.engine_job_id}`);
    } catch (err: any) {
      if (err?.status === 404) {
        await this.db.query("UPDATE generation_jobs SET status='failed', error=$1, updated_at=now() WHERE id=$2", ["La préparation a été interrompue (redémarrage du moteur).", id]);
        return { status: "failed", progress: 0, error: "La préparation a été interrompue (redémarrage du moteur).", steps: [] };
      }
      throw err;
    }
    if (job.status === "done" && job.result) {
      const scenarioId = randomUUID();
      const sc = { ...job.result, id: scenarioId };
      const params = row.params;
      await this.db.query(
        "INSERT INTO scenarios(id, owner_id, mode, title, prompt, summary, data, provider) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [scenarioId, user.id, sc.mode, params.name || sc.title, params.prompt, sc.summary, sc, sc.generation?.provider ?? "rules"]);
      await this.db.query("UPDATE generation_jobs SET status='done', scenario_id=$1, updated_at=now() WHERE id=$2", [scenarioId, id]);
      return { status: "done", progress: 1, scenarioId, steps: job.steps, elapsed: job.elapsed_seconds };
    }
    if (job.status === "failed") {
      await this.db.query("UPDATE generation_jobs SET status='failed', error=$1, updated_at=now() WHERE id=$2", [job.error, id]);
    }
    return { status: job.status, progress: job.progress, steps: job.steps, error: job.error, overdue: job.overdue, elapsed: job.elapsed_seconds, target: job.target_seconds };
  }

  async cancel(user: AuthUser, id: string) {
    const row = await this.db.one("SELECT * FROM generation_jobs WHERE id = $1 AND owner_id = $2", [id, user.id]);
    if (!row) throw new NotFoundException();
    await this.engine.call("DELETE", `/scenarios/jobs/${row.engine_job_id}`);
    await this.db.query("UPDATE generation_jobs SET status='failed', error='Annulée', updated_at=now() WHERE id=$1", [id]);
    return { cancelled: true };
  }

  async list(user: AuthUser, mode?: string) {
    const rows = await this.db.query(
      "SELECT s.*, (SELECT count(*) FROM sessions x WHERE x.scenario_id = s.id) AS sessions FROM scenarios s WHERE owner_id = $1 AND ($2::text IS NULL OR mode = $2) ORDER BY updated_at DESC",
      [user.id, mode ?? null]);
    return rows.map((r) => ({ ...publicScenario(r), sessions: Number(r.sessions) }));
  }

  async get(user: AuthUser, id: string) {
    const row = await this.db.one("SELECT * FROM scenarios WHERE id = $1", [id]);
    if (!row) throw new NotFoundException("Scénario introuvable.");
    if (row.owner_id !== user.id) throw new ForbiddenException();
    return publicScenario(row);
  }

  async remove(user: AuthUser, id: string) {
    const row = await this.db.one("SELECT owner_id FROM scenarios WHERE id = $1", [id]);
    if (!row || row.owner_id !== user.id) throw new NotFoundException();
    const used = await this.db.one("SELECT count(*) AS n FROM sessions WHERE scenario_id = $1", [id]);
    if (Number(used?.n) > 0) throw new ForbiddenException("Ce scénario a déjà servi à des sessions archivées : il est conservé.");
    await this.db.query("DELETE FROM scenarios WHERE id = $1", [id]);
    return { deleted: true };
  }
}

@Controller("scenarios")
@UseGuards(AuthGuard)
export class ScenariosController {
  constructor(private readonly svc: ScenariosService, private readonly engine: EngineClient) {}

  @Post("questions")
  questions(@Body() body: unknown) {
    return this.engine.post("/questions/next", parse(questionSchema, body));
  }

  @Post("plan-preview")
  plan(@Body() body: unknown) {
    const p = parse(z.object({ durationMinutes: z.number().int(), teams: z.number().int().min(1).max(16), tempo: z.string().optional() }), body);
    return this.engine.post("/sessions/plan", { duration_minutes: p.durationMinutes, team_count: p.teams, tempo: p.tempo ?? "mixed" });
  }

  @Post("jobs")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.svc.createJob(user, body);
  }

  @Get("jobs/:id")
  job(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.job(user, id);
  }

  @Delete("jobs/:id")
  cancel(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.cancel(user, id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("mode") mode?: string) {
    return this.svc.list(user, mode);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.get(user, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.remove(user, id);
  }
}
