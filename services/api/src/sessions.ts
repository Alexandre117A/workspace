import {
  Body, ConflictException, Controller, ForbiddenException, forwardRef, GoneException, Get, Inject, Injectable, NotFoundException, Param, ParseUUIDPipe,
  Post, Req, ServiceUnavailableException, UseGuards,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createSessionSchema, formatJoinCode, isValidJoinCode, joinSessionSchema, normalizeJoinCode, SOCKET_EVENTS } from "@geonex/shared";
import { z } from "zod";
import { AuthGuard, AuthUser, CurrentUser } from "./auth";
import { config } from "./config";
import { Db } from "./db";
import { EngineClient } from "./engine.client";
import { GameService } from "./game.service";
import { Hub } from "./hub";
import { publicScenario } from "./scenarios";
import { ParticipantRow, Store } from "./store";
import { AttemptLimiter, emblemFor, generateJoinCode, parse, seedFromUuid } from "./util";

@Injectable()
export class SessionsService {
  private limiter = new AttemptLimiter(10, 10 * 60_000);

  constructor(
    private readonly db: Db,
    private readonly store: Store,
    private readonly engine: EngineClient,
    private readonly hub: Hub,
    @Inject(forwardRef(() => GameService)) private readonly game: GameService,
  ) {}

  async create(user: AuthUser, input: unknown) {
    const p = parse(createSessionSchema, input);
    const scenario = await this.db.one("SELECT * FROM scenarios WHERE id = $1", [p.scenarioId]);
    if (!scenario || scenario.owner_id !== user.id) throw new NotFoundException("Scénario introuvable.");
    const id = randomUUID();
    const seed = seedFromUuid(randomUUID());
    const prep = await this.engine.post("/sessions/prepare", { scenario: scenario.data, session_id: id, team_count: p.teams, duration_minutes: p.durationMinutes, seed });
    let code = "";
    for (let i = 0; i < 6; i++) {
      code = generateJoinCode();
      if (!(await this.db.one("SELECT id FROM sessions WHERE code = $1", [code]))) break;
    }
    const expires = new Date(Date.now() + config.sessionTtlHours * 3600_000).toISOString();
    await this.db.query(
      "INSERT INTO sessions(id, scenario_id, name, code, status, expected_teams, duration_minutes, creator_id, plan, seed, expires_at) VALUES ($1,$2,$3,$4,'lobby',$5,$6,$7,$8,$9,$10)",
      [id, p.scenarioId, p.name || scenario.title, code, p.teams, p.durationMinutes, user.id, prep.plan, seed, expires]);
    await this.store.saveWorld(id, prep.world, "lobby");
    await this.db.query("INSERT INTO participants(id, session_id, user_id, role, display_name, emblem) VALUES ($1,$2,$3,'president',$4,$5)",
      [randomUUID(), id, user.id, user.displayName, "✠"]);
    await this.store.log(id, "session_created", { teams: p.teams, duration: p.durationMinutes });
    return { sessionId: id, code: formatJoinCode(code), plan: prep.plan };
  }

  async join(user: AuthUser, input: unknown, ip: string) {
    const { code: raw } = parse(joinSessionSchema, input);
    const key = `${user.id}|${ip}`;
    this.limiter.check(key);
    const code = normalizeJoinCode(raw);
    const session = isValidJoinCode(code) ? await this.db.one("SELECT * FROM sessions WHERE code = $1", [code]) : undefined;
    if (!session) {
      this.limiter.fail(key);
      throw new NotFoundException("Code de participation invalide.");
    }
    const existing = await this.store.participantForUser(session.id, user.id);
    if (existing) return { sessionId: session.id, rejoined: true };
    if (session.status === "finished" || session.status === "expired" || new Date(session.expires_at).getTime() < Date.now()) {
      throw new GoneException("Cette session est terminée ou a expiré.");
    }
    if (session.status !== "lobby") throw new ConflictException("La partie a déjà commencé : seuls ses participants peuvent la rejoindre.");
    const parts = await this.store.participants(session.id);
    const teams = parts.filter((x) => x.role === "team");
    if (teams.length >= session.expected_teams) throw new ConflictException("Cette session est complète.");
    try {
      await this.db.query("INSERT INTO participants(id, session_id, user_id, role, display_name, emblem) VALUES ($1,$2,$3,'team',$4,$5)",
        [randomUUID(), session.id, user.id, user.displayName, emblemFor(parts.length)]);
    } catch {
      return { sessionId: session.id, rejoined: true }; // course entre deux requêtes du même utilisateur
    }
    this.limiter.reset(key);
    await this.broadcastLobby(session.id);
    return { sessionId: session.id, rejoined: false };
  }

  async lobbyData(sessionId: string, me: ParticipantRow) {
    const session = await this.store.session(sessionId);
    if (!session) throw new NotFoundException();
    const scenario = await this.db.one("SELECT * FROM scenarios WHERE id = $1", [session.scenario_id]);
    const parts = await this.store.participants(sessionId);
    return {
      session: {
        id: session.id, name: session.name, code: formatJoinCode(session.code), status: session.status, expectedTeams: session.expected_teams,
        durationMinutes: session.duration_minutes, plan: session.plan, createdAt: session.created_at, startedAt: session.started_at,
        isCreator: session.creator_id === me.user_id,
      },
      scenario: scenario ? publicScenario(scenario) : null,
      participants: parts.map((p) => ({ id: p.id, displayName: p.display_name, emblem: p.emblem, role: p.role, connected: p.connected, actorId: p.actor_id,
        absencePolicy: p.absence_policy })),
      me: { participantId: me.id, role: me.role, actorId: me.actor_id, consent: me.consent_comms },
    };
  }

  async broadcastLobby(sessionId: string) {
    const parts = await this.store.participants(sessionId);
    this.hub.emit(Hub.session(sessionId), SOCKET_EVENTS.lobby, {
      participants: parts.map((p) => ({ id: p.id, displayName: p.display_name, emblem: p.emblem, role: p.role, connected: p.connected, actorId: p.actor_id, absencePolicy: p.absence_policy })),
    });
  }

  private async me(user: AuthUser, sessionId: string) {
    const part = await this.store.participantForUser(sessionId, user.id);
    if (!part) throw new ForbiddenException("Vous ne participez pas à cette session.");
    return part;
  }

  async lobby(user: AuthUser, sessionId: string) {
    return this.lobbyData(sessionId, await this.me(user, sessionId));
  }

  async consent(user: AuthUser, sessionId: string, input: unknown) {
    const { consent } = parse(z.object({ consent: z.boolean() }), input);
    const part = await this.me(user, sessionId);
    await this.db.query("UPDATE participants SET consent_comms = $1 WHERE id = $2", [consent, part.id]);
    await this.store.log(sessionId, "consent", { consent }, part.actor_id);
    return { consent };
  }

  async transfer(user: AuthUser, sessionId: string, input: unknown) {
    const { participantId } = parse(z.object({ participantId: z.string().uuid() }), input);
    const session = await this.store.session(sessionId);
    const me = await this.me(user, sessionId);
    if (!session || session.status !== "lobby") throw new ConflictException("Le rôle ne peut être transféré qu'avant le lancement.");
    if (me.role !== "president" && session.creator_id !== user.id) throw new ForbiddenException("Seul le Président ou le créateur peut transférer le rôle.");
    const parts = await this.store.participants(sessionId);
    const target = parts.find((p) => p.id === participantId);
    const current = parts.find((p) => p.role === "president");
    if (!target || target.role === "president" || !current) throw new NotFoundException("Participant introuvable.");
    await this.db.query("UPDATE participants SET role='team', emblem=$1 WHERE id=$2", [target.emblem, current.id]);
    await this.db.query("UPDATE participants SET role='president', emblem='✠' WHERE id=$1", [target.id]);
    this.hub.leave(Hub.participant(sessionId, current.id), Hub.president(sessionId));
    this.hub.join(Hub.participant(sessionId, target.id), Hub.president(sessionId));
    await this.store.log(sessionId, "president_transferred", { from: current.id, to: target.id }, null, "public");
    await this.broadcastLobby(sessionId);
    this.hub.emit(Hub.session(sessionId), SOCKET_EVENTS.lobby, { roleChanged: true });
    return { ok: true };
  }

  async leave(user: AuthUser, sessionId: string) {
    const session = await this.store.session(sessionId);
    const me = await this.me(user, sessionId);
    if (!session || session.status !== "lobby") throw new ConflictException("Impossible de quitter une partie lancée.");
    if (me.role === "president") throw new ConflictException("Transférez d'abord le rôle de Président de séance.");
    await this.db.query("DELETE FROM participants WHERE id = $1", [me.id]);
    await this.broadcastLobby(sessionId);
    return { left: true };
  }

  async start(user: AuthUser, sessionId: string) {
    const me = await this.me(user, sessionId);
    if (me.role !== "president") throw new ForbiddenException("Seul le Président de séance lance la partie.");
    await this.game.start(sessionId);
    return { started: true };
  }

  async mine(user: AuthUser) {
    return this.db.query(
      "SELECT s.id, s.name, s.status, s.created_at, s.finished_at, p.role, p.actor_id FROM participants p JOIN sessions s ON s.id = p.session_id WHERE p.user_id = $1 ORDER BY s.created_at DESC LIMIT 50",
      [user.id]);
  }

  /** Jetons audio LiveKit : permissions de publication décidées par le serveur selon la phase. */
  async audioToken(user: AuthUser, sessionId: string, input: unknown) {
    const { channel } = parse(z.object({ channel: z.enum(["assembly", "call"]) }), input);
    const lk = config.livekit;
    if (!lk.url || !lk.apiKey || !lk.apiSecret) {
      throw new ServiceUnavailableException("Audio non configuré (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) : utilisez le canal texte.");
    }
    const me = await this.me(user, sessionId);
    const rt = this.game.runtime(sessionId);
    if (!rt) throw new ConflictException("Aucune partie en cours.");
    const { AccessToken } = await import("livekit-server-sdk");
    let room: string;
    let canPublish = false;
    if (channel === "assembly") {
      room = `geonex-${sessionId}-assembly`;
      canPublish = rt.phase === "assembly" && !!me.actor_id && rt.assembly?.speaker === me.actor_id;
    } else {
      const call = rt.calls.find((c) => c.a === me.actor_id || c.b === me.actor_id);
      if (!call) throw new ForbiddenException("Aucune communication privée en cours.");
      room = `geonex-${sessionId}-call-${call.id}`;
      canPublish = true;
    }
    const at = new AccessToken(lk.apiKey, lk.apiSecret, { identity: me.id, name: me.display_name, ttl: 120 });
    at.addGrant({ room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: false });
    await this.db.query("INSERT INTO usage_records(session_id, service, units, meta) VALUES ($1,'voice_token',1,$2)", [sessionId, { channel }]);
    return { url: lk.url, token: await at.toJwt(), room, canPublish };
  }
}

@Controller("sessions")
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly svc: SessionsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.svc.create(user, body);
  }

  @Post("join")
  join(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() req: any) {
    return this.svc.join(user, body, req.ip ?? "unknown");
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.mine(user);
  }

  @Get(":id")
  lobby(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.lobby(user, id);
  }

  @Post(":id/consent")
  consent(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.consent(user, id, body);
  }

  @Post(":id/transfer-president")
  transfer(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.transfer(user, id, body);
  }

  @Post(":id/leave")
  leave(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.leave(user, id);
  }

  @Post(":id/start")
  start(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.start(user, id);
  }

  @Post(":id/audio-token")
  audio(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.audioToken(user, id, body);
  }
}
