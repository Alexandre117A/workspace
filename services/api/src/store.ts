import { Injectable } from "@nestjs/common";
import { Db } from "./db";

export interface SessionRow {
  id: string;
  scenario_id: string;
  name: string;
  code: string;
  status: string;
  expected_teams: number;
  duration_minutes: number;
  creator_id: string;
  plan: any;
  seed: string | number;
  runtime: any;
  created_at: string;
  started_at: string | null;
  ends_at: string | null;
  finished_at: string | null;
  expires_at: string;
}

export interface ParticipantRow {
  id: string;
  session_id: string;
  user_id: string;
  role: "team" | "president";
  actor_id: string | null;
  display_name: string;
  emblem: string;
  consent_comms: boolean;
  connected: boolean;
  absence_policy: string;
  joined_at: string;
}

/** Persistance des parties : état du monde versionné, vues filtrées, journal. */
@Injectable()
export class Store {
  private worlds = new Map<string, { version: number; world: any }>();

  constructor(private readonly db: Db) {}

  session(id: string) {
    return this.db.one<SessionRow>("SELECT * FROM sessions WHERE id = $1", [id]);
  }

  participants(sessionId: string) {
    return this.db.query<ParticipantRow>("SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at", [sessionId]);
  }

  participantForUser(sessionId: string, userId: string) {
    return this.db.one<ParticipantRow>("SELECT * FROM participants WHERE session_id = $1 AND user_id = $2", [sessionId, userId]);
  }

  async world(sessionId: string): Promise<any> {
    const cached = this.worlds.get(sessionId);
    if (cached) return structuredClone(cached.world);
    const row = await this.db.one("SELECT version, state FROM world_states WHERE session_id = $1 ORDER BY version DESC LIMIT 1", [sessionId]);
    if (!row) throw new Error("État du monde introuvable");
    this.worlds.set(sessionId, { version: row.version, world: row.state });
    return structuredClone(row.state);
  }

  /** Sauvegarde régulière : chaque mutation crée une nouvelle version restaurable. */
  async saveWorld(sessionId: string, world: any, phase: string): Promise<number> {
    const current = this.worlds.get(sessionId)?.version ?? ((await this.db.one("SELECT max(version) AS v FROM world_states WHERE session_id = $1", [sessionId]))?.v ?? -1);
    const version = Number(current) + 1;
    await this.db.query("INSERT INTO world_states(session_id, version, round, phase, state) VALUES ($1,$2,$3,$4,$5)",
      [sessionId, version, world.round ?? 0, phase, world]);
    this.worlds.set(sessionId, { version, world: structuredClone(world) });
    return version;
  }

  async saveViews(sessionId: string, views: { public: any; president: any; teams: Record<string, any> }) {
    await this.db.query(
      "INSERT INTO session_views(session_id, audience, data) VALUES ($1,'president',$2) ON CONFLICT (session_id, audience) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [sessionId, views.president]);
    await this.db.query(
      "INSERT INTO session_views(session_id, audience, data) VALUES ($1,'public',$2) ON CONFLICT (session_id, audience) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [sessionId, views.public]);
    for (const [actor, view] of Object.entries(views.teams)) {
      await this.db.query(
        "INSERT INTO session_views(session_id, audience, data) VALUES ($1,$2,$3) ON CONFLICT (session_id, audience) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
        [sessionId, `actor:${actor}`, view]);
    }
  }

  async view(sessionId: string, audience: string) {
    return (await this.db.one("SELECT data FROM session_views WHERE session_id = $1 AND audience = $2", [sessionId, audience]))?.data ?? null;
  }

  async log(sessionId: string | null, type: string, payload: unknown = {}, actor: string | null = null, visibility = "internal") {
    await this.db.query("INSERT INTO event_log(session_id, type, actor, visibility, payload) VALUES ($1,$2,$3,$4,$5)",
      [sessionId, type, actor, visibility, payload ?? {}]);
  }

  async saveRuntime(sessionId: string, runtime: unknown) {
    await this.db.query("UPDATE sessions SET runtime = $1 WHERE id = $2", [runtime, sessionId]);
  }

  forget(sessionId: string) {
    this.worlds.delete(sessionId);
  }
}
