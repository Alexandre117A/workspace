import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CALL_MAX_SECONDS, CARDS_FIRST_ROUND, DECISIONS_NEEDING_ARBITRATION, DECISION_LABELS, INVITE_TIMEOUT_SECONDS, MAX_DECISIONS_PER_ROUND,
  Phase, RuntimeAssembly, RuntimeCall, RuntimeInvite, RuntimeState, SessionStatus, SOCKET_EVENTS, cardSubmitSchema, decisionSchema,
  messageSchema, romeProposalSchema, rulingSchema,
} from "@geonex/shared";
import { z } from "zod";
import { config, ms } from "./config";
import { Db } from "./db";
import { EngineClient } from "./engine.client";
import { Hub } from "./hub";
import { ParticipantRow, Store } from "./store";
import { parse, seedFromUuid } from "./util";

interface Assembly extends RuntimeAssembly {
  mainSpeaker: string | null;
  speechOverride: number | null;
}

export interface Runtime {
  sessionId: string;
  status: SessionStatus;
  phase: Phase;
  round: number;
  roundsPlanned: number;
  plan: any;
  timers: Record<string, number>;
  paused: boolean;
  pausedAt: number | null;
  pausedTimers: Record<string, number> | null;
  lastRound: boolean;
  ready: string[];
  submitted: string[];
  diplomacyDone: string[];
  assembly: Assembly | null;
  calls: RuntimeCall[];
  invites: RuntimeInvite[];
  overlay: { type: "rome"; id: string; acked: string[]; deadline: number } | null;
  pendingRome: string | null;
  scheduledRome: string | null;
  endsAt: number | null;
  startedAt: number | null;
  speakingOrder: string[];
  presidentPid: string;
}

const ARBITRATED_CARDS = ["political_shock", "new_front"];
const ROME_ACK_SECONDS = 120;
const ROME_GRACE_SECONDS = 15;

export interface Actor {
  pid: string;
  role: "team" | "president";
  actor: string | null;
  userId: string;
}

/**
 * Orchestrateur des parties. Le serveur est l'autorité sur les chronomètres,
 * les phases, les ressources (via le moteur), les décisions validées et les
 * droits d'accès. Chaque transition est persistée : une panne n'efface pas la
 * partie, qui reprend depuis le dernier état cohérent.
 */
@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly log = new Logger("Game");
  private runtimes = new Map<string, Runtime>();
  private handles = new Map<string, Map<string, NodeJS.Timeout>>();
  private locks = new Map<string, Promise<unknown>>();

  constructor(private readonly db: Db, private readonly store: Store, private readonly engine: EngineClient, private readonly hub: Hub) {}

  // ------------------------------------------------------------------ infrastructure

  private lock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(sessionId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.locks.set(sessionId, run.catch(() => undefined));
    return run;
  }

  runtime(sessionId: string): Runtime | undefined {
    return this.runtimes.get(sessionId);
  }

  private setTimer(rt: Runtime, name: string, delayMs: number, force = false) {
    this.clearTimer(rt, name);
    rt.timers[name] = Date.now() + delayMs;
    if (rt.paused && !force) {
      rt.pausedTimers = { ...(rt.pausedTimers ?? {}), [name]: delayMs };
      return;
    }
    this.arm(rt.sessionId, name, delayMs);
  }

  private arm(sessionId: string, name: string, delayMs: number) {
    let map = this.handles.get(sessionId);
    if (!map) this.handles.set(sessionId, (map = new Map()));
    map.set(name, setTimeout(() => {
      map!.delete(name);
      this.lock(sessionId, () => this.fire(sessionId, name)).catch((err) => this.log.error(`Minuteur ${name} : ${err?.stack ?? err}`));
    }, Math.max(0, delayMs)));
  }

  private clearTimer(rt: Runtime, name: string) {
    const map = this.handles.get(rt.sessionId);
    const h = map?.get(name);
    if (h) clearTimeout(h);
    map?.delete(name);
    delete rt.timers[name];
    if (rt.pausedTimers) delete rt.pausedTimers[name];
  }

  private clearAll(rt: Runtime) {
    for (const h of this.handles.get(rt.sessionId)?.values() ?? []) clearTimeout(h);
    this.handles.delete(rt.sessionId);
    rt.timers = {};
  }

  private pauseTimers(rt: Runtime, except: string[] = []) {
    const now = Date.now();
    rt.pausedTimers = {};
    for (const [name, deadline] of Object.entries(rt.timers)) {
      if (except.includes(name)) continue;
      rt.pausedTimers[name] = Math.max(0, deadline - now);
      delete rt.timers[name];
      const h = this.handles.get(rt.sessionId)?.get(name);
      if (h) clearTimeout(h);
      this.handles.get(rt.sessionId)?.delete(name);
    }
    rt.paused = true;
    rt.pausedAt = now;
  }

  private resumeTimers(rt: Runtime) {
    if (!rt.paused) return;
    const now = Date.now();
    const pausedFor = rt.pausedAt ? now - rt.pausedAt : 0;
    rt.paused = false;
    for (const [name, remaining] of Object.entries(rt.pausedTimers ?? {})) {
      rt.timers[name] = now + remaining;
      this.arm(rt.sessionId, name, remaining);
    }
    // Les échéances affichées suivent la pause ; la durée totale est prolongée d'autant.
    if (rt.assembly?.deadline) rt.assembly.deadline += pausedFor;
    if (rt.assembly?.budgetEndsAt) rt.assembly.budgetEndsAt += pausedFor;
    for (const c of rt.calls) c.deadline += pausedFor;
    for (const i of rt.invites) i.expiresAt += pausedFor;
    if (rt.endsAt) rt.endsAt += pausedFor;
    rt.pausedTimers = null;
    rt.pausedAt = null;
  }

  private async fire(sessionId: string, name: string) {
    const rt = this.runtimes.get(sessionId);
    if (!rt || rt.status === "finished") return;
    delete rt.timers[name];
    if (name === "phase") await this.onPhaseTimeout(rt);
    else if (name === "assembly") await this.onAssemblyTimer(rt);
    else if (name.startsWith("call:")) await this.endCall(rt, name.slice(5), "timeout");
    else if (name.startsWith("invite:")) await this.expireInvite(rt, name.slice(7));
    else if (name === "rome") await this.finishRome(rt);
    else if (name === "rome-grace") await this.maybeFinishRome(rt);
    else if (name === "rome-schedule") await this.triggerRome(rt, rt.scheduledRome);
    await this.persist(rt);
  }

  private async persist(rt: Runtime) {
    await this.store.saveRuntime(rt.sessionId, rt);
  }

  // ------------------------------------------------------------------ participants & diffusion

  async actors(sessionId: string): Promise<ParticipantRow[]> {
    return this.store.participants(sessionId);
  }

  private async activeTeams(rt: Runtime): Promise<string[]> {
    const connected = await this.hub.connectedParticipantIds(rt.sessionId);
    const parts = await this.store.participants(rt.sessionId);
    return parts.filter((p) => p.role === "team" && p.actor_id && connected.has(p.id) && p.absence_policy !== "npc").map((p) => p.actor_id!) as string[];
  }

  private async teamActors(rt: Runtime): Promise<string[]> {
    const parts = await this.store.participants(rt.sessionId);
    return parts.filter((p) => p.role === "team" && p.actor_id).map((p) => p.actor_id!) as string[];
  }

  publicRuntime(rt: Runtime, actor: string | null, pendingRequests = 0): RuntimeState {
    const president = actor === null;
    return {
      sessionId: rt.sessionId,
      status: rt.status,
      phase: rt.phase,
      round: rt.round,
      roundsPlanned: rt.roundsPlanned,
      phaseDeadline: rt.paused ? null : rt.timers.phase ?? null,
      paused: rt.paused,
      pausedRemainingMs: rt.paused ? rt.pausedTimers?.phase ?? null : null,
      serverNow: Date.now(),
      lastRound: rt.lastRound,
      ready: rt.ready,
      submitted: rt.submitted,
      diplomacyDone: rt.diplomacyDone,
      assembly: rt.assembly ? { queue: rt.assembly.queue, speaker: rt.assembly.speaker, mode: rt.assembly.mode, deadline: rt.paused ? null : rt.assembly.deadline,
        floorRequests: rt.assembly.floorRequests, rebuttalsUsed: rt.assembly.rebuttalsUsed, budgetEndsAt: rt.assembly.budgetEndsAt } : null,
      // Confidentialité : une équipe ne voit que ses propres appels et invitations ;
      // les autres équipes apparaissent seulement « occupées ».
      calls: president ? rt.calls : rt.calls.filter((c) => c.a === actor || c.b === actor),
      invites: president ? rt.invites : rt.invites.filter((i) => i.from === actor || i.to === actor),
      overlay: rt.overlay,
      endsAt: rt.endsAt,
      pendingRequests,
      ...(president ? {} : { busy: rt.calls.flatMap((c) => [c.a, c.b]).filter((x) => x !== actor) }),
    } as RuntimeState;
  }

  private async pendingCount(rt: Runtime) {
    const r = await this.db.one("SELECT count(*) AS n FROM president_requests WHERE session_id=$1 AND round=$2 AND status='pending'", [rt.sessionId, rt.round]);
    return Number(r?.n ?? 0);
  }

  async emitRuntime(rt: Runtime) {
    const pending = await this.pendingCount(rt);
    for (const actor of await this.teamActors(rt)) this.hub.emit(Hub.actor(rt.sessionId, actor), SOCKET_EVENTS.runtime, this.publicRuntime(rt, actor));
    this.hub.emit(Hub.president(rt.sessionId), SOCKET_EVENTS.runtime, this.publicRuntime(rt, null, pending));
  }

  private async emitViews(sessionId: string, views: any) {
    if (!views) return;
    await this.store.saveViews(sessionId, views);
    for (const [actor, view] of Object.entries(views.teams ?? {})) this.hub.emit(Hub.actor(sessionId, actor), SOCKET_EVENTS.view, view);
    this.hub.emit(Hub.president(sessionId), SOCKET_EVENTS.view, views.president);
  }

  private async applyEngine(rt: Runtime, res: { world?: any; views?: any }, phase: string) {
    if (res.world) await this.store.saveWorld(rt.sessionId, res.world, phase);
    if (res.views) await this.emitViews(rt.sessionId, res.views);
  }

  async emitRequests(rt: Runtime) {
    const rows = await this.db.query("SELECT * FROM president_requests WHERE session_id=$1 AND round=$2 ORDER BY created_at", [rt.sessionId, rt.round]);
    this.hub.emit(Hub.president(rt.sessionId), SOCKET_EVENTS.requests, rows);
  }

  // ------------------------------------------------------------------ démarrage

  async start(sessionId: string): Promise<void> {
    return this.lock(sessionId, async () => {
      const session = await this.store.session(sessionId);
      if (!session || session.status !== "lobby") throw new BadRequestException("La partie ne peut pas être lancée.");
      const parts = await this.store.participants(sessionId);
      const teams = parts.filter((p) => p.role === "team");
      const president = parts.find((p) => p.role === "president");
      if (!teams.length || !president) throw new BadRequestException("Au moins une équipe et un Président de séance sont nécessaires.");
      const world = await this.store.world(sessionId);
      // Le moteur adapte les acteurs et l'organisation des phases au nombre d'équipes présentes.
      const res = await this.engine.post("/sessions/assign", { world, team_count: teams.length });
      const order = [...teams].sort((a, b) => (seedFromUuid(a.id) ^ Number(session.seed)) - (seedFromUuid(b.id) ^ Number(session.seed)));
      for (let i = 0; i < order.length; i++) {
        await this.db.query("UPDATE participants SET actor_id=$1 WHERE id=$2", [res.assignment[i], order[i].id]);
        this.hub.join(Hub.participant(sessionId, order[i].id), Hub.actor(sessionId, res.assignment[i]));
      }
      for (const [actor, dossier] of Object.entries(res.dossiers)) {
        await this.db.query("INSERT INTO dossiers(session_id, actor_id, data) VALUES ($1,$2,$3) ON CONFLICT (session_id, actor_id) DO UPDATE SET data = EXCLUDED.data", [sessionId, actor, dossier]);
      }
      await this.store.saveWorld(sessionId, res.world, "dossier");
      await this.store.saveViews(sessionId, res.views);
      const plan = res.world.plan;
      const now = Date.now();
      const rt: Runtime = {
        sessionId, status: "dossier", phase: "dossier", round: 0, roundsPlanned: plan.rounds_planned, plan, timers: {}, paused: false, pausedAt: null,
        pausedTimers: null, lastRound: false, ready: [], submitted: [], diplomacyDone: [], assembly: null, calls: [], invites: [], overlay: null,
        pendingRome: null, scheduledRome: null, endsAt: now + ms(session.duration_minutes * 60), startedAt: now, speakingOrder: [], presidentPid: president.id,
      };
      this.runtimes.set(sessionId, rt);
      await this.db.query("UPDATE sessions SET status='dossier', plan=$1, started_at=now(), ends_at=$2 WHERE id=$3", [plan, new Date(rt.endsAt!).toISOString(), sessionId]);
      this.setTimer(rt, "phase", ms(plan.setup_seconds));
      await this.store.log(sessionId, "game_started", { teams: teams.length, assignment: res.assignment });
      await this.persist(rt);
      this.hub.emit(Hub.session(sessionId), SOCKET_EVENTS.lobby, { started: true });
      await this.emitRuntime(rt);
      await this.emitViews(sessionId, res.views);
    });
  }

  // ------------------------------------------------------------------ phases

  private async onPhaseTimeout(rt: Runtime) {
    switch (rt.phase) {
      case "dossier":
        return this.beginRound(rt);
      case "briefing":
        return this.startAssembly(rt);
      case "assembly":
        return this.endAssembly(rt);
      case "diplomacy":
        return this.startDecisions(rt);
      case "decisions":
        return this.startArbitration(rt);
      case "arbitration":
        return this.arbitrationTimeout(rt);
      case "consequences":
        return this.nextRoundOrEnd(rt);
      default:
        return;
    }
  }

  private async setPhase(rt: Runtime, phase: Phase, seconds: number | null) {
    rt.phase = phase;
    this.clearTimer(rt, "phase");
    if (seconds !== null) this.setTimer(rt, "phase", ms(seconds));
    await this.store.log(rt.sessionId, "phase", { phase, round: rt.round }, null, "public");
    await this.persist(rt);
    await this.emitRuntime(rt);
  }

  private async beginRound(rt: Runtime) {
    const world = await this.store.world(rt.sessionId);
    const res = await this.engine.post("/rounds/begin", { world });
    await this.applyEngine(rt, res, "briefing");
    rt.round = res.briefing.round;
    rt.speakingOrder = res.briefing.speaking_order;
    rt.status = "running";
    rt.ready = [];
    await this.db.query("UPDATE sessions SET status='running' WHERE id=$1", [rt.sessionId]);
    // Dernier round : annoncé dès qu'un seul round complet peut encore tenir.
    const remaining = (rt.endsAt ?? Infinity) - Date.now();
    const roundMs = ms(rt.plan.round_seconds);
    if (!rt.lastRound && (rt.round >= rt.roundsPlanned || remaining < 2 * roundMs)) {
      rt.lastRound = true;
      rt.roundsPlanned = rt.round;
      this.hub.emit(Hub.session(rt.sessionId), SOCKET_EVENTS.lastRound, { round: rt.round, message: "C'est le moment de faire basculer la balance de votre côté." });
    }
    await this.setPhase(rt, "briefing", rt.plan.phase_seconds.briefing);
  }

  async ready(sessionId: string, who: Actor) {
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      if (!who.actor || !["dossier", "briefing", "consequences"].includes(rt.phase)) return;
      if (!rt.ready.includes(who.actor)) rt.ready.push(who.actor);
      if (rt.phase === "dossier") await this.db.query("UPDATE dossiers SET opened_at = COALESCE(opened_at, now()) WHERE session_id=$1 AND actor_id=$2", [sessionId, who.actor]);
      const active = await this.activeTeams(rt);
      if (active.every((a) => rt.ready.includes(a))) await this.onPhaseTimeout(rt);
      else await this.emitRuntime(rt);
      await this.persist(rt);
    });
  }

  // ------------------------------------------------------------------ Assemblée publique

  private async startAssembly(rt: Runtime) {
    const budget = ms(rt.plan.phase_seconds.assembly);
    rt.assembly = { queue: [...rt.speakingOrder], speaker: null, mode: "idle", deadline: null, floorRequests: [], rebuttalsUsed: {},
      budgetEndsAt: Date.now() + budget, mainSpeaker: null, speechOverride: rt.assembly?.speechOverride ?? null };
    await this.setPhase(rt, "assembly", rt.plan.phase_seconds.assembly + 20);
    await this.scheduleRome(rt, "assembly", budget);
    await this.nextSpeaker(rt);
  }

  private async nextSpeaker(rt: Runtime) {
    const a = rt.assembly!;
    const connected = await this.hub.connectedParticipantIds(rt.sessionId);
    const parts = await this.store.participants(rt.sessionId);
    const online = new Set(parts.filter((p) => p.actor_id && connected.has(p.id)).map((p) => p.actor_id));
    while (a.queue.length && !online.has(a.queue[0])) a.queue.shift(); // une équipe absente ne bloque pas l'Assemblée
    const now = Date.now();
    if (!a.queue.length || now >= a.budgetEndsAt!) return this.endAssembly(rt);
    a.speaker = a.queue.shift()!;
    a.mainSpeaker = a.speaker;
    a.mode = "speech";
    a.floorRequests = [];
    const teamsLeft = a.queue.length + 1;
    const fair = (a.budgetEndsAt! - now) / teamsLeft - ms(rt.plan.assembly.reaction_seconds);
    const speech = Math.min(ms(a.speechOverride ?? rt.plan.assembly.speech_seconds), Math.max(ms(15), fair));
    a.deadline = now + speech;
    this.setTimer(rt, "assembly", speech);
    await this.emitRuntime(rt);
  }

  private async onAssemblyTimer(rt: Runtime) {
    const a = rt.assembly;
    if (!a || rt.phase !== "assembly") return;
    const now = Date.now();
    if (a.mode === "speech") {
      const room = a.budgetEndsAt! - now > ms(rt.plan.assembly.reaction_seconds + rt.plan.assembly.rebuttal_seconds);
      if (rt.plan.assembly.max_rebuttals_per_team > 0 && room && (await this.activeTeams(rt)).length > 1) {
        a.mode = "reaction";
        a.speaker = a.mainSpeaker;
        a.floorRequests = [];
        a.deadline = now + ms(rt.plan.assembly.reaction_seconds);
        this.setTimer(rt, "assembly", ms(rt.plan.assembly.reaction_seconds));
        return this.emitRuntime(rt);
      }
      return this.nextSpeaker(rt);
    }
    if (a.mode === "reaction") {
      // Une seule réplique par fenêtre, et chaque équipe dispose d'un quota : aucun duo ne monopolise le temps.
      const candidate = a.floorRequests.find((x) => x !== a.mainSpeaker && (a.rebuttalsUsed[x] ?? 0) < rt.plan.assembly.max_rebuttals_per_team);
      if (candidate) {
        a.mode = "rebuttal";
        a.speaker = candidate;
        a.rebuttalsUsed[candidate] = (a.rebuttalsUsed[candidate] ?? 0) + 1;
        const dur = Math.min(ms(rt.plan.assembly.rebuttal_seconds), Math.max(ms(5), a.budgetEndsAt! - now));
        a.deadline = now + dur;
        this.setTimer(rt, "assembly", dur);
        return this.emitRuntime(rt);
      }
      return this.nextSpeaker(rt);
    }
    if (a.mode === "rebuttal") return this.nextSpeaker(rt);
  }

  private async endAssembly(rt: Runtime) {
    if (rt.phase !== "assembly") return;
    this.clearTimer(rt, "assembly");
    if (rt.assembly) {
      rt.assembly.mode = "idle";
      rt.assembly.speaker = null;
      rt.assembly.deadline = null;
    }
    await this.startDiplomacy(rt);
  }

  async endSpeech(sessionId: string, who: Actor) {
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      const a = rt.assembly;
      if (rt.phase !== "assembly" || !a || rt.paused) return;
      const isSpeaker = a.speaker === who.actor && (a.mode === "speech" || a.mode === "rebuttal");
      if (!isSpeaker && who.role !== "president") throw new ForbiddenException("Vous n'avez pas la parole.");
      this.clearTimer(rt, "assembly");
      await this.onAssemblyTimer(rt);
      await this.persist(rt);
    });
  }

  async requestFloor(sessionId: string, who: Actor) {
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      const a = rt.assembly;
      if (!who.actor || rt.phase !== "assembly" || a?.mode !== "reaction") throw new BadRequestException("Aucune fenêtre de réaction ouverte.");
      if (who.actor === a.mainSpeaker) throw new BadRequestException("Vous venez de parler.");
      if ((a.rebuttalsUsed[who.actor] ?? 0) >= rt.plan.assembly.max_rebuttals_per_team) throw new BadRequestException("Quota de répliques atteint pour ce round.");
      if (!a.floorRequests.includes(who.actor)) a.floorRequests.push(who.actor);
      await this.emitRuntime(rt);
      await this.persist(rt);
    });
  }

  async statement(sessionId: string, who: Actor, body: unknown) {
    const { text } = parse(messageSchema, body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      const a = rt.assembly;
      if (rt.phase !== "assembly" || !a || a.speaker !== who.actor || !["speech", "rebuttal"].includes(a.mode)) throw new ForbiddenException("Vous n'avez pas la parole.");
      const consent = await this.consentOf(sessionId, [who.pid]);
      const id = randomUUID();
      await this.db.query("INSERT INTO messages(id, session_id, round, channel, from_actor, content, analyzable) VALUES ($1,$2,$3,'assembly',$4,$5,$6)",
        [id, sessionId, rt.round, who.actor, text, consent]);
      this.hub.emit(Hub.session(sessionId), SOCKET_EVENTS.message, { id, channel: "assembly", from: who.actor, text, at: Date.now(), mode: a.mode });
    });
  }

  async shorten(sessionId: string, who: Actor, body: unknown) {
    const p = parse(z.object({ target: z.enum(["speech", "diplomacy"]), seconds: z.number().int().min(10).max(600).optional() }), body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      this.requirePresident(rt, who);
      if (p.target === "speech" && rt.assembly) {
        if (p.seconds) rt.assembly.speechOverride = Math.min(p.seconds, rt.plan.assembly.speech_seconds);
        if (rt.phase === "assembly" && ["speech", "rebuttal"].includes(rt.assembly.mode)) {
          this.clearTimer(rt, "assembly");
          await this.onAssemblyTimer(rt);
        }
      }
      if (p.target === "diplomacy" && rt.phase === "diplomacy") {
        const target = Math.min((rt.timers.phase ?? Date.now()) - Date.now(), ms(p.seconds ?? 60));
        this.setTimer(rt, "phase", Math.max(0, target));
      }
      await this.store.log(sessionId, "president_shorten", p, null, "public");
      await this.emitRuntime(rt);
      await this.persist(rt);
    });
  }

  // ------------------------------------------------------------------ Diplomatie

  private async startDiplomacy(rt: Runtime) {
    rt.diplomacyDone = [];
    rt.calls = [];
    rt.invites = [];
    await this.setPhase(rt, "diplomacy", rt.plan.phase_seconds.diplomacy);
    await this.scheduleRome(rt, "diplomacy", ms(rt.plan.phase_seconds.diplomacy));
  }

  async invite(sessionId: string, who: Actor, body: unknown) {
    const { target } = parse(z.object({ target: z.string().min(1).max(12) }), body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      if (rt.phase !== "diplomacy" || rt.paused) throw new BadRequestException("Les invitations ne sont possibles qu'en phase de Diplomatie.");
      if (!who.actor || target === who.actor) throw new BadRequestException("Invitation invalide.");
      if (!(await this.teamActors(rt)).includes(target)) throw new BadRequestException("Cet acteur n'est pas contrôlé par une équipe.");
      if (rt.calls.some((c) => [c.a, c.b].includes(who.actor!) || [c.a, c.b].includes(target))) throw new BadRequestException("L'une des équipes est déjà en communication.");
      if (rt.invites.some((i) => i.from === who.actor && i.to === target)) throw new BadRequestException("Invitation déjà envoyée.");
      const inv: RuntimeInvite = { id: randomUUID(), from: who.actor, to: target, expiresAt: Date.now() + ms(INVITE_TIMEOUT_SECONDS) };
      rt.invites.push(inv);
      this.setTimer(rt, `invite:${inv.id}`, ms(INVITE_TIMEOUT_SECONDS));
      this.hub.emit(Hub.actor(sessionId, target), SOCKET_EVENTS.invite, inv);
      await this.emitRuntime(rt);
      await this.persist(rt);
      return inv;
    });
  }

  async respond(sessionId: string, who: Actor, body: unknown) {
    const { inviteId, accept } = parse(z.object({ inviteId: z.string().uuid(), accept: z.boolean() }), body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      const inv = rt.invites.find((i) => i.id === inviteId);
      if (!inv || inv.to !== who.actor) throw new BadRequestException("Invitation introuvable ou expirée.");
      rt.invites = rt.invites.filter((i) => i.id !== inviteId);
      this.clearTimer(rt, `invite:${inviteId}`);
      if (accept) {
        if (rt.phase !== "diplomacy") throw new BadRequestException("La Diplomatie est terminée.");
        if (rt.calls.some((c) => [c.a, c.b].includes(inv.from) || [c.a, c.b].includes(inv.to))) throw new BadRequestException("Une équipe est déjà en communication.");
        const now = Date.now();
        const callMs = Math.min(ms(CALL_MAX_SECONDS), Math.max(ms(5), (rt.timers.phase ?? now + ms(CALL_MAX_SECONDS)) - now));
        const call: RuntimeCall = { id: randomUUID(), a: inv.from, b: inv.to, startedAt: now, deadline: now + callMs };
        rt.calls.push(call);
        // Une équipe engagée dans un nouvel appel n'a plus d'invitations en attente.
        rt.invites = rt.invites.filter((i) => ![call.a, call.b].includes(i.from) && ![call.a, call.b].includes(i.to));
        this.setTimer(rt, `call:${call.id}`, callMs);
        await this.db.query("INSERT INTO calls(id, session_id, round, a_actor, b_actor) VALUES ($1,$2,$3,$4,$5)", [call.id, sessionId, rt.round, call.a, call.b]);
      }
      this.hub.emit(Hub.actor(sessionId, inv.from), SOCKET_EVENTS.invite, { ...inv, response: accept ? "accepted" : "declined" });
      await this.emitRuntime(rt);
      await this.persist(rt);
    });
  }

  private async expireInvite(rt: Runtime, id: string) {
    const inv = rt.invites.find((i) => i.id === id);
    rt.invites = rt.invites.filter((i) => i.id !== id);
    if (inv) this.hub.emit(Hub.actor(rt.sessionId, inv.from), SOCKET_EVENTS.invite, { ...inv, response: "expired" });
    await this.emitRuntime(rt);
  }

  private async endCall(rt: Runtime, callId: string, reason: string) {
    const call = rt.calls.find((c) => c.id === callId);
    if (!call) return;
    rt.calls = rt.calls.filter((c) => c.id !== callId);
    this.clearTimer(rt, `call:${callId}`);
    await this.db.query("UPDATE calls SET ended_at = now() WHERE id = $1", [callId]);
    for (const actor of [call.a, call.b]) this.hub.emit(Hub.actor(rt.sessionId, actor), SOCKET_EVENTS.message, { channel: `call:${callId}`, system: true, text: reason === "timeout" ? "Communication terminée (durée maximale atteinte)." : "Communication terminée.", at: Date.now() });
    await this.emitRuntime(rt);
    await this.checkDiplomacyEnd(rt);
  }

  async hangUp(sessionId: string, who: Actor, body: unknown) {
    const { callId } = parse(z.object({ callId: z.string().uuid() }), body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      const call = rt.calls.find((c) => c.id === callId);
      if (!call || ![call.a, call.b].includes(who.actor!)) throw new BadRequestException("Communication introuvable.");
      await this.endCall(rt, callId, "hangup");
      await this.persist(rt);
    });
  }

  async callMessage(sessionId: string, who: Actor, body: unknown) {
    const { text } = parse(messageSchema, body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      const call = rt.calls.find((c) => c.a === who.actor || c.b === who.actor);
      if (!call) throw new BadRequestException("Aucune communication en cours.");
      const other = call.a === who.actor ? call.b : call.a;
      const parts = await this.store.participants(sessionId);
      const pids = parts.filter((p) => [call.a, call.b].includes(p.actor_id ?? "")).map((p) => p.id);
      // Analyse par le moteur seulement si les deux interlocuteurs y ont consenti.
      const analyze = await this.consentOf(sessionId, pids);
      const id = randomUUID();
      await this.db.query("INSERT INTO messages(id, session_id, round, channel, from_actor, to_actor, content, analyzable) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [id, sessionId, rt.round, `call:${call.id}`, who.actor, other, text, analyze]);
      const msg = { id, channel: `call:${call.id}`, from: who.actor, to: other, text, at: Date.now() };
      this.hub.emit(Hub.actor(sessionId, call.a), SOCKET_EVENTS.message, msg);
      this.hub.emit(Hub.actor(sessionId, call.b), SOCKET_EVENTS.message, msg);
    });
  }

  async diplomacyDone(sessionId: string, who: Actor) {
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      if (rt.phase !== "diplomacy" || !who.actor) return;
      if (!rt.diplomacyDone.includes(who.actor)) rt.diplomacyDone.push(who.actor);
      await this.checkDiplomacyEnd(rt);
      await this.emitRuntime(rt);
      await this.persist(rt);
    });
  }

  private async checkDiplomacyEnd(rt: Runtime) {
    if (rt.phase !== "diplomacy" || rt.calls.length) return;
    const active = await this.activeTeams(rt);
    if (active.length && active.every((a) => rt.diplomacyDone.includes(a))) await this.startDecisions(rt);
  }

  // ------------------------------------------------------------------ Décisions, cartes, arbitrage

  private async startDecisions(rt: Runtime) {
    for (const c of [...rt.calls]) await this.endCall(rt, c.id, "phase");
    for (const i of rt.invites) this.clearTimer(rt, `invite:${i.id}`);
    rt.invites = [];
    rt.submitted = [];
    await this.setPhase(rt, "decisions", rt.plan.phase_seconds.decisions);
  }

  async submitDecisions(sessionId: string, who: Actor, body: unknown) {
    const decisions = parse(z.array(decisionSchema).max(MAX_DECISIONS_PER_ROUND), (body as any)?.decisions ?? body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      if (rt.phase !== "decisions" || rt.paused) throw new BadRequestException("Les décisions se prennent pendant la phase Décisions.");
      if (!who.actor) throw new ForbiddenException("Seules les équipes prennent des décisions.");
      const world = await this.store.world(sessionId);
      const check = await this.engine.post("/decisions/validate", { world, actor_id: who.actor, decisions });
      const errors = Object.values(check.errors ?? {}).flat();
      if (errors.length) throw new BadRequestException(errors.join(" "));
      await this.db.query("DELETE FROM president_requests WHERE session_id=$1 AND round=$2 AND actor_id=$3 AND kind IN ('decision','note') AND status='pending'", [sessionId, rt.round, who.actor]);
      await this.db.query("DELETE FROM decisions WHERE session_id=$1 AND round=$2 AND actor_id=$3", [sessionId, rt.round, who.actor]);
      for (const d of decisions) {
        const id = randomUUID();
        await this.db.query("INSERT INTO decisions(id, session_id, round, participant_id, actor_id, client_id, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [id, sessionId, rt.round, who.pid, who.actor, d.id, d]);
        const needs = DECISIONS_NEEDING_ARBITRATION.includes(d.category) || !!d.note;
        if (needs) {
          const summary = `${DECISION_LABELS[d.category]}${d.targets.length ? ` → ${d.targets.join(", ")}` : ""} — ${d.intent || "intention non précisée"}`.slice(0, 500);
          await this.db.query("INSERT INTO president_requests(id, session_id, round, actor_id, kind, ref_id, summary, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            [randomUUID(), sessionId, rt.round, who.actor, DECISIONS_NEEDING_ARBITRATION.includes(d.category) ? "decision" : "note", id, summary, d.note ?? null]);
        }
      }
      if (!rt.submitted.includes(who.actor)) rt.submitted.push(who.actor);
      await this.store.log(sessionId, "decisions_submitted", { count: decisions.length, round: rt.round }, who.actor);
      await this.emitRequests(rt);
      const active = await this.activeTeams(rt);
      if (active.every((a) => rt.submitted.includes(a))) await this.startArbitration(rt);
      else await this.emitRuntime(rt);
      await this.persist(rt);
      return { accepted: decisions.length };
    });
  }

  async submitCard(sessionId: string, who: Actor, body: unknown) {
    const { card, payload } = parse(cardSubmitSchema, body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      if (!["diplomacy", "decisions"].includes(rt.phase) || rt.paused) throw new BadRequestException("Les cartes s'utilisent pendant la Diplomatie ou les Décisions.");
      if (rt.round < CARDS_FIRST_ROUND) throw new BadRequestException(`Les cartes sont disponibles à partir du round ${CARDS_FIRST_ROUND}.`);
      if (!who.actor) throw new ForbiddenException();
      const world = await this.store.world(sessionId);
      const res = await this.engine.post("/cards/submit", { world, actor_id: who.actor, card, payload });
      await this.applyEngine(rt, res, rt.phase);
      await this.db.query("INSERT INTO card_uses(id, session_id, round, actor_id, card, engine_use_id, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), sessionId, rt.round, who.actor, card, res.use.id, payload]);
      if (ARBITRATED_CARDS.includes(card)) {
        await this.db.query("INSERT INTO president_requests(id, session_id, round, actor_id, kind, ref_id, summary) VALUES ($1,$2,$3,$4,'card',$5,$6)",
          [randomUUID(), sessionId, rt.round, who.actor, res.use.id, res.use.official_request.slice(0, 600)]);
        await this.emitRequests(rt);
      }
      await this.store.log(sessionId, "card_submitted", { card, round: rt.round }, who.actor);
      await this.emitRuntime(rt);
      return { use: { id: res.use.id, official_request: res.use.official_request } };
    });
  }

  /** Estimation de chance avant validation : lecture seule, aucun effet sur la partie. */
  async previewDecisions(sessionId: string, who: Actor, body: unknown) {
    const decisions = parse(z.array(decisionSchema).max(MAX_DECISIONS_PER_ROUND), (body as any)?.decisions ?? body);
    if (!who.actor) throw new ForbiddenException();
    const world = await this.store.world(sessionId);
    return this.engine.post("/decisions/preview", { world, actor_id: who.actor, decisions });
  }

  async estimate(sessionId: string, who: Actor, body: unknown) {
    const { target } = parse(z.object({ target: z.string().max(12) }), body);
    if (!who.actor) throw new ForbiddenException();
    const world = await this.store.world(sessionId);
    return this.engine.post("/cards/estimate", { world, actor_id: who.actor, target });
  }

  async interpret(sessionId: string, who: Actor, body: unknown) {
    const p = parse(z.object({ kind: z.string().max(40), text: z.string().trim().min(3).max(1500) }), body);
    if (!who.actor) throw new ForbiddenException();
    const world = await this.store.world(sessionId);
    return this.engine.post("/requests/interpret", { world, actor_id: who.actor, kind: p.kind, text: p.text });
  }

  private async startArbitration(rt: Runtime) {
    if (await this.pendingCount(rt)) {
      await this.setPhase(rt, "arbitration", rt.plan.phase_seconds.arbitration);
      await this.emitRequests(rt);
    } else {
      await this.startResolution(rt);
    }
  }

  async rule(sessionId: string, who: Actor, body: unknown) {
    const p = parse(rulingSchema, body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      this.requirePresident(rt, who);
      const req = await this.db.one("SELECT * FROM president_requests WHERE id=$1 AND session_id=$2", [p.requestId, sessionId]);
      if (!req || req.status !== "pending") throw new BadRequestException("Demande déjà traitée ou introuvable.");
      await this.db.query("UPDATE president_requests SET status=$1, probability=$2, decided_at=now() WHERE id=$3",
        [p.approve ? "approved" : "refused", p.approve ? p.probability ?? null : null, p.requestId]);
      if (req.kind === "card") {
        const world = await this.store.world(sessionId);
        const res = await this.engine.post("/cards/rule", { world, use_id: req.ref_id, approve: p.approve, probability: p.approve ? p.probability ?? null : null });
        await this.applyEngine(rt, res, rt.phase);
      }
      await this.store.log(sessionId, "ruling", { request: p.requestId, approve: p.approve, probability: p.probability ?? null }, req.actor_id);
      await this.emitRequests(rt);
      if (rt.phase === "arbitration" && !(await this.pendingCount(rt))) await this.startResolution(rt);
      else await this.emitRuntime(rt);
      await this.persist(rt);
    });
  }

  /** Règle explicite de fin de délai : une demande non arbitrée est transmise au
   * moteur sans probabilité présidentielle — elle n'est jamais perdue. */
  private async arbitrationTimeout(rt: Runtime) {
    await this.db.query("UPDATE president_requests SET status='timeout', decided_at=now() WHERE session_id=$1 AND round=$2 AND status='pending'", [rt.sessionId, rt.round]);
    await this.store.log(rt.sessionId, "arbitration_timeout", { round: rt.round });
    await this.startResolution(rt);
  }

  private async startResolution(rt: Runtime) {
    await this.setPhase(rt, "resolution", null);
    let world = await this.store.world(rt.sessionId);
    const already = (world.rounds ?? []).some((r: any) => r.round === rt.round);
    let report: any = null;
    if (!already) {
      const rows = await this.db.query("SELECT * FROM decisions WHERE session_id=$1 AND round=$2", [rt.sessionId, rt.round]);
      const reqs = await this.db.query("SELECT * FROM president_requests WHERE session_id=$1 AND round=$2 AND kind='decision'", [rt.sessionId, rt.round]);
      const byRef = new Map(reqs.map((r) => [r.ref_id, r]));
      const decisions = rows.map((r) => {
        const d = r.payload;
        const ruling = byRef.get(r.id);
        return {
          id: r.id, actor: r.actor_id, category: d.category, targets: d.targets, zone: d.zone ?? null, intent: d.intent, allocation: d.allocation,
          resources: d.resources, secret: d.secret, ruling: ruling ? (ruling.status === "approved" ? "approved" : ruling.status === "refused" ? "refused" : "timeout") : "none",
          president_probability: ruling?.status === "approved" && ruling.probability !== null ? Number(ruling.probability) : null,
        };
      });
      const msgs = await this.db.query("SELECT * FROM messages WHERE session_id=$1 AND round=$2 ORDER BY created_at", [rt.sessionId, rt.round]);
      const messages = msgs.map((m) => ({ channel: m.channel, from_actor: m.from_actor, to_actor: m.to_actor, text: m.content, analyze: m.analyzable }));
      const res = await this.engine.post("/rounds/resolve", { world, decisions, messages }, 120_000);
      report = res.report;
      await this.applyEngine(rt, res, "consequences");
      await this.db.query("INSERT INTO reports(session_id, round, audience, data) VALUES ($1,$2,'public',$3) ON CONFLICT DO NOTHING", [rt.sessionId, rt.round, report.public]);
      await this.db.query("INSERT INTO reports(session_id, round, audience, data) VALUES ($1,$2,'president',$3) ON CONFLICT DO NOTHING", [rt.sessionId, rt.round, report.president]);
      for (const [actor, data] of Object.entries(report.private)) {
        await this.db.query("INSERT INTO reports(session_id, round, audience, data) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [rt.sessionId, rt.round, `actor:${actor}`, data]);
      }
      await this.store.log(rt.sessionId, "round_resolved", { round: rt.round, npc_decisions: report.npc_decisions, commitments: report.commitments_extracted });
    }
    for (const actor of await this.teamActors(rt)) {
      const data = await this.reportFor(rt.sessionId, rt.round, `actor:${actor}`);
      this.hub.emit(Hub.actor(rt.sessionId, actor), SOCKET_EVENTS.report, { round: rt.round, public: await this.reportFor(rt.sessionId, rt.round, "public"), private: data });
    }
    this.hub.emit(Hub.president(rt.sessionId), SOCKET_EVENTS.report, { round: rt.round, public: await this.reportFor(rt.sessionId, rt.round, "public"), president: await this.reportFor(rt.sessionId, rt.round, "president") });
    rt.ready = [];
    await this.setPhase(rt, "consequences", rt.plan.phase_seconds.consequences);
  }

  async reportFor(sessionId: string, round: number, audience: string) {
    return (await this.db.one("SELECT data FROM reports WHERE session_id=$1 AND round=$2 AND audience=$3", [sessionId, round, audience]))?.data ?? null;
  }

  private async nextRoundOrEnd(rt: Runtime) {
    const remaining = (rt.endsAt ?? Infinity) - Date.now();
    if (rt.lastRound || rt.round >= rt.roundsPlanned || remaining < ms(rt.plan.round_seconds) * 0.5) return this.finalize(rt);
    return this.beginRound(rt);
  }

  private async finalize(rt: Runtime) {
    await this.setPhase(rt, "final", null);
    const world = await this.store.world(rt.sessionId);
    const parts = await this.store.participants(rt.sessionId);
    const meta = {
      real_duration_seconds: Math.round((Date.now() - (rt.startedAt ?? Date.now())) / 1000 / Math.max(config.timeScale, 1e-6)),
      participants: parts.filter((p) => p.role === "team").map((p) => ({ name: p.display_name, actor: p.actor_id, emblem: p.emblem })),
      president: parts.find((p) => p.role === "president")?.display_name ?? null,
      rounds: rt.round,
    };
    const res = await this.engine.post("/game/finalize", { world, meta });
    await this.applyEngine(rt, res, "ended");
    await this.db.query("INSERT INTO archives(session_id, data) VALUES ($1,$2) ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data", [rt.sessionId, res.archive]);
    await this.db.query("UPDATE sessions SET status='finished', finished_at=now() WHERE id=$1", [rt.sessionId]);
    rt.status = "finished";
    rt.phase = "ended";
    this.clearAll(rt);
    await this.store.log(rt.sessionId, "game_finished", { winner: res.archive.winner });
    await this.persist(rt);
    await this.emitRuntime(rt);
    this.hub.emit(Hub.session(rt.sessionId), SOCKET_EVENTS.ended, { sessionId: rt.sessionId, cinematic: res.archive.cinematic });
  }

  // ------------------------------------------------------------------ Communiqués de Rome

  private async scheduleRome(rt: Runtime, phase: string, phaseMs: number) {
    if (rt.round < 2 || rt.overlay || rt.scheduledRome) return;
    const world = await this.store.world(rt.sessionId);
    const res = await this.engine.post("/rome/check", { world, phase });
    await this.store.saveWorld(rt.sessionId, res.world, rt.phase);
    if (res.check.prepare) {
      rt.scheduledRome = res.check.communique_id;
      await this.db.query("INSERT INTO rome_communiques(session_id, id, round, origin, payload) VALUES ($1,$2,$3,'auto',$4) ON CONFLICT DO NOTHING",
        [rt.sessionId, res.check.communique_id, rt.round, res.payload]);
      this.setTimer(rt, "rome-schedule", Math.round(phaseMs * res.check.deliver_offset));
      await this.store.log(rt.sessionId, "rome_prepared", { id: res.check.communique_id, leader_share: res.check.leader_share }, null, "president");
    }
  }

  private async romePayload(sessionId: string, id: string) {
    return (await this.db.one("SELECT payload FROM rome_communiques WHERE session_id=$1 AND id=$2", [sessionId, id]))?.payload ?? null;
  }

  async emitRome(rt: Runtime, toPid?: string) {
    if (!rt.overlay) return;
    const payload = await this.romePayload(rt.sessionId, rt.overlay.id);
    if (!payload) return;
    const parts = await this.store.participants(rt.sessionId);
    for (const p of parts) {
      if (toPid && p.id !== toPid) continue;
      if (rt.overlay.acked.includes(p.id)) continue;
      const data = p.role === "president" ? { ...payload.general, per_actor: payload.president.per_actor, deadline: rt.overlay.deadline }
        : { ...payload.general, mine: payload.per_team[p.actor_id ?? ""] ?? [], deadline: rt.overlay.deadline };
      this.hub.emit(Hub.participant(rt.sessionId, p.id), SOCKET_EVENTS.rome, data);
    }
  }

  private async triggerRome(rt: Runtime, id: string | null) {
    if (!id || rt.overlay || rt.status !== "running") return;
    rt.scheduledRome = null;
    this.clearTimer(rt, "rome-schedule");
    // Interruption immédiate : tous les chronomètres concernés sont suspendus.
    this.pauseTimers(rt);
    rt.overlay = { type: "rome", id, acked: [], deadline: Date.now() + ms(ROME_ACK_SECONDS) };
    this.setTimer(rt, "rome", ms(ROME_ACK_SECONDS), true);
    this.setTimer(rt, "rome-grace", ms(ROME_GRACE_SECONDS), true);
    await this.store.log(rt.sessionId, "rome_delivered", { id }, null, "public");
    await this.emitRuntime(rt);
    await this.emitRome(rt);
  }

  async ackRome(sessionId: string, who: Actor) {
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      if (!rt.overlay) return;
      if (!rt.overlay.acked.includes(who.pid)) rt.overlay.acked.push(who.pid);
      await this.maybeFinishRome(rt);
      await this.persist(rt);
    });
  }

  private async maybeFinishRome(rt: Runtime) {
    if (!rt.overlay) return;
    const connected = await this.hub.connectedParticipantIds(rt.sessionId);
    const graceOver = !rt.timers["rome-grace"];
    const parts = await this.store.participants(rt.sessionId);
    // Les participants déconnectés ne bloquent pas la session (consultation à leur retour).
    const required = parts.filter((p) => connected.has(p.id) || !graceOver).map((p) => p.id);
    if (required.every((pid) => rt.overlay!.acked.includes(pid))) await this.finishRome(rt);
    else await this.emitRuntime(rt);
  }

  private async finishRome(rt: Runtime) {
    if (!rt.overlay) return;
    const id = rt.overlay.id;
    this.clearTimer(rt, "rome");
    this.clearTimer(rt, "rome-grace");
    const world = await this.store.world(rt.sessionId);
    const res = await this.engine.post("/rome/apply", { world, communique_id: id });
    await this.applyEngine(rt, res, rt.phase);
    await this.db.query("UPDATE rome_communiques SET delivered_at = now() WHERE session_id=$1 AND id=$2", [rt.sessionId, id]);
    rt.overlay = null;
    this.resumeTimers(rt);
    await this.emitRuntime(rt);
  }

  async proposeRome(sessionId: string, who: Actor, body: unknown) {
    const { text } = parse(romeProposalSchema, body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      this.requirePresident(rt, who);
      if (rt.status !== "running" || rt.overlay) throw new BadRequestException("Impossible de proposer un communiqué maintenant.");
      if (rt.pendingRome) {
        const w = await this.store.world(sessionId);
        const cancelled = await this.engine.post("/rome/cancel", { world: w, communique_id: rt.pendingRome });
        await this.store.saveWorld(sessionId, cancelled.world, rt.phase);
        rt.pendingRome = null;
      }
      const world = await this.store.world(sessionId);
      const res = await this.engine.post("/rome/propose", { world, text, seed_key: `pres:${randomUUID()}` });
      await this.store.saveWorld(sessionId, res.world, rt.phase);
      if (!res.result.coherent) return { coherent: false, issues: res.result.issues };
      rt.pendingRome = res.result.communique_id;
      await this.db.query("INSERT INTO rome_communiques(session_id, id, round, origin, payload) VALUES ($1,$2,$3,'president',$4) ON CONFLICT DO NOTHING",
        [sessionId, res.result.communique_id, rt.round, res.payload]);
      await this.persist(rt);
      return { coherent: true, draft: { id: res.result.communique_id, ...res.payload.general, per_actor: res.payload.president.per_actor } };
    });
  }

  async confirmRome(sessionId: string, who: Actor, body: unknown) {
    const { id, confirm } = parse(z.object({ id: z.string(), confirm: z.boolean() }), body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      this.requirePresident(rt, who);
      if (rt.pendingRome !== id) throw new BadRequestException("Brouillon introuvable.");
      rt.pendingRome = null;
      if (confirm) await this.triggerRome(rt, id);
      else {
        const world = await this.store.world(sessionId);
        const res = await this.engine.post("/rome/cancel", { world, communique_id: id });
        await this.store.saveWorld(sessionId, res.world, rt.phase);
      }
      await this.persist(rt);
    });
  }

  // ------------------------------------------------------------------ contrôle du Président

  async pause(sessionId: string, who: Actor, paused: boolean) {
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      this.requirePresident(rt, who);
      if (rt.overlay) throw new BadRequestException("Un Communiqué de Rome est en cours de consultation.");
      if (paused && !rt.paused) this.pauseTimers(rt);
      if (!paused && rt.paused) this.resumeTimers(rt);
      await this.store.log(sessionId, paused ? "paused" : "resumed", {}, null, "public");
      await this.emitRuntime(rt);
      await this.persist(rt);
    });
  }

  async absence(sessionId: string, who: Actor, body: unknown) {
    const p = parse(z.object({ participantId: z.string().uuid(), policy: z.enum(["hold", "npc"]) }), body);
    return this.lock(sessionId, async () => {
      const rt = this.must(sessionId);
      this.requirePresident(rt, who);
      const part = (await this.store.participants(sessionId)).find((x) => x.id === p.participantId && x.role === "team");
      if (!part?.actor_id) throw new BadRequestException("Équipe introuvable.");
      const world = await this.store.world(sessionId);
      const res = await this.engine.post("/sessions/control", { world, actor_id: part.actor_id, controlled_by: p.policy === "npc" ? "npc" : "human" });
      await this.applyEngine(rt, res, rt.phase);
      await this.db.query("UPDATE participants SET absence_policy=$1 WHERE id=$2", [p.policy, p.participantId]);
      await this.store.log(sessionId, "absence_policy", p, part.actor_id, "public");
      await this.emitRuntime(rt);
    });
  }

  // ------------------------------------------------------------------ utilitaires

  private must(sessionId: string): Runtime {
    const rt = this.runtimes.get(sessionId);
    if (!rt || rt.status === "finished") throw new BadRequestException("Aucune partie en cours.");
    return rt;
  }

  private requirePresident(rt: Runtime, who: Actor) {
    if (who.role !== "president" || who.pid !== rt.presidentPid) throw new ForbiddenException("Réservé au Président de séance.");
  }

  private async consentOf(sessionId: string, pids: string[]): Promise<boolean> {
    const parts = await this.store.participants(sessionId);
    return pids.length > 0 && pids.every((pid) => parts.find((p) => p.id === pid)?.consent_comms);
  }

  async onPresenceChange(sessionId: string) {
    const rt = this.runtimes.get(sessionId);
    if (!rt || rt.status === "finished") return;
    await this.lock(sessionId, async () => {
      if (rt.overlay) await this.maybeFinishRome(rt);
      await this.emitRuntime(rt);
    });
  }

  /** Reprise après redémarrage : les parties en cours repartent de leur dernier état. */
  async restore(): Promise<void> {
    const rows = await this.db.query("SELECT id, runtime FROM sessions WHERE status IN ('dossier','running') AND runtime IS NOT NULL");
    for (const row of rows) {
      const rt = row.runtime as Runtime;
      this.runtimes.set(row.id, rt);
      const now = Date.now();
      for (const [name, deadline] of Object.entries(rt.timers)) this.arm(row.id, name, Math.max(0, deadline - now));
      if (rt.phase === "resolution") this.lock(row.id, () => this.startResolution(rt)).catch((e) => this.log.error(e));
      this.log.log(`Partie restaurée : ${row.id} (round ${rt.round}, phase ${rt.phase})`);
    }
  }

  onModuleDestroy() {
    for (const map of this.handles.values()) for (const h of map.values()) clearTimeout(h);
    this.handles.clear();
  }
}
