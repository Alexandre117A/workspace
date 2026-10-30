import { Logger } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@geonex/shared";
import { AuthService } from "./auth";
import { Db } from "./db";
import { Actor, GameService } from "./game.service";
import { Hub } from "./hub";
import { SessionsService } from "./sessions";
import { Store } from "./store";

type Ack = { ok: boolean; data?: unknown; error?: string };

/**
 * Passerelle temps réel. Chaque socket est authentifiée (jeton) et rattachée à
 * un participant ; elle ne rejoint que les salons qu'elle a le droit d'écouter
 * (session, son équipe, ou le poste du Président).
 */
@WebSocketGateway({ namespace: "/game", cors: { origin: true, credentials: true } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger("Gateway");

  constructor(
    private readonly hub: Hub,
    private readonly auth: AuthService,
    private readonly store: Store,
    private readonly game: GameService,
    private readonly sessions: SessionsService,
    private readonly db: Db,
  ) {}

  afterInit(server: Server) {
    this.hub.server = server as any;
  }

  async handleConnection(socket: Socket) {
    try {
      const { token, sessionId } = socket.handshake.auth ?? {};
      const user = await this.auth.authenticate(String(token ?? ""));
      const part = await this.store.participantForUser(String(sessionId), user.id);
      if (!part) throw new Error("not participant");
      socket.data = { userId: user.id, sessionId: part.session_id, participantId: part.id };
      socket.join(Hub.session(part.session_id));
      socket.join(Hub.participant(part.session_id, part.id));
      if (part.role === "president") socket.join(Hub.president(part.session_id));
      if (part.actor_id) socket.join(Hub.actor(part.session_id, part.actor_id));
      await this.db.query("UPDATE participants SET connected = true, last_seen = now() WHERE id = $1", [part.id]);
      await this.sync(socket);
      await this.sessions.broadcastLobby(part.session_id);
      await this.game.onPresenceChange(part.session_id);
    } catch {
      socket.emit(SOCKET_EVENTS.error, { message: "Accès refusé à cette session." });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const { sessionId, participantId } = socket.data ?? {};
    if (!sessionId) return;
    const still = (await this.hub.connectedParticipantIds(sessionId)).has(participantId);
    if (!still) await this.db.query("UPDATE participants SET connected = false, last_seen = now() WHERE id = $1", [participantId]);
    await this.sessions.broadcastLobby(sessionId);
    await this.game.onPresenceChange(sessionId);
  }

  /** Resynchronisation complète (connexion et reconnexion) : rôle, équipe, vue, chronomètres. */
  private async sync(socket: Socket) {
    const { sessionId, participantId } = socket.data;
    const part = (await this.store.participants(sessionId)).find((p) => p.id === participantId)!;
    const lobby = await this.sessions.lobbyData(sessionId, part);
    const rt = this.game.runtime(sessionId);
    const audience = part.role === "president" ? "president" : part.actor_id ? `actor:${part.actor_id}` : null;
    const view = audience ? await this.store.view(sessionId, audience) : null;
    const dossier = part.actor_id ? (await this.db.one("SELECT data, opened_at FROM dossiers WHERE session_id=$1 AND actor_id=$2", [sessionId, part.actor_id])) ?? null : null;
    let report = null;
    if (rt && rt.round > 0 && audience) {
      const pub = await this.game.reportFor(sessionId, rt.round, "public");
      const mine = await this.game.reportFor(sessionId, rt.round, audience);
      if (pub || mine) report = { round: rt.round, public: pub, [part.role === "president" ? "president" : "private"]: mine };
    }
    let pending = 0;
    if (rt && part.role === "president") {
      pending = Number((await this.db.one("SELECT count(*) AS n FROM president_requests WHERE session_id=$1 AND round=$2 AND status='pending'", [sessionId, rt.round]))?.n ?? 0);
    }
    socket.emit(SOCKET_EVENTS.state, {
      ...lobby,
      runtime: rt ? this.game.publicRuntime(rt, part.role === "president" ? null : part.actor_id, pending) : null,
      view,
      dossier: dossier ? { ...dossier.data, opened: !!dossier.opened_at } : null,
      report,
    });
    if (rt?.overlay && !rt.overlay.acked.includes(part.id)) await this.game.emitRome(rt, part.id);
    if (rt && part.role === "president") await this.game.emitRequests(rt);
  }

  private async who(socket: Socket): Promise<Actor> {
    const { sessionId, participantId, userId } = socket.data ?? {};
    const part = (await this.store.participants(sessionId)).find((p) => p.id === participantId);
    if (!part) throw new Error("Participant introuvable.");
    return { pid: part.id, role: part.role, actor: part.actor_id, userId };
  }

  private async run(socket: Socket, fn: (sessionId: string, who: Actor) => Promise<unknown>): Promise<Ack> {
    try {
      const who = await this.who(socket);
      const data = await fn(socket.data.sessionId, who);
      return { ok: true, data };
    } catch (err: any) {
      const message = err?.response?.message ?? err?.message ?? "Erreur";
      return { ok: false, error: Array.isArray(message) ? message.join(" ") : String(message) };
    }
  }

  @SubscribeMessage("sync")
  async onSync(@ConnectedSocket() s: Socket): Promise<Ack> {
    await this.sync(s);
    return { ok: true };
  }
  @SubscribeMessage("ready")
  ready(@ConnectedSocket() s: Socket) {
    return this.run(s, (id, who) => this.game.ready(id, who));
  }
  @SubscribeMessage("assembly:end")
  endSpeech(@ConnectedSocket() s: Socket) {
    return this.run(s, (id, who) => this.game.endSpeech(id, who));
  }
  @SubscribeMessage("assembly:floor")
  floor(@ConnectedSocket() s: Socket) {
    return this.run(s, (id, who) => this.game.requestFloor(id, who));
  }
  @SubscribeMessage("assembly:statement")
  statement(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.statement(id, who, body));
  }
  @SubscribeMessage("diplomacy:invite")
  invite(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.invite(id, who, body));
  }
  @SubscribeMessage("diplomacy:respond")
  respond(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.respond(id, who, body));
  }
  @SubscribeMessage("diplomacy:hangup")
  hangup(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.hangUp(id, who, body));
  }
  @SubscribeMessage("diplomacy:message")
  message(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.callMessage(id, who, body));
  }
  @SubscribeMessage("diplomacy:done")
  done(@ConnectedSocket() s: Socket) {
    return this.run(s, (id, who) => this.game.diplomacyDone(id, who));
  }
  @SubscribeMessage("decisions:submit")
  submit(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.submitDecisions(id, who, body));
  }
  @SubscribeMessage("decisions:preview")
  preview(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.previewDecisions(id, who, body));
  }
  @SubscribeMessage("request:interpret")
  interpret(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.interpret(id, who, body));
  }
  @SubscribeMessage("card:submit")
  card(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.submitCard(id, who, body));
  }
  @SubscribeMessage("card:estimate")
  estimate(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.estimate(id, who, body));
  }
  @SubscribeMessage("rome:ack")
  ack(@ConnectedSocket() s: Socket) {
    return this.run(s, (id, who) => this.game.ackRome(id, who));
  }
  @SubscribeMessage("president:rule")
  rule(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.rule(id, who, body));
  }
  @SubscribeMessage("president:shorten")
  shorten(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.shorten(id, who, body));
  }
  @SubscribeMessage("president:pause")
  pause(@ConnectedSocket() s: Socket, @MessageBody() body: { paused: boolean }) {
    return this.run(s, (id, who) => this.game.pause(id, who, !!body?.paused));
  }
  @SubscribeMessage("president:rome_propose")
  propose(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.proposeRome(id, who, body));
  }
  @SubscribeMessage("president:rome_confirm")
  confirm(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.confirmRome(id, who, body));
  }
  @SubscribeMessage("president:absence")
  absence(@ConnectedSocket() s: Socket, @MessageBody() body: unknown) {
    return this.run(s, (id, who) => this.game.absence(id, who, body));
  }
}
