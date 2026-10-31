import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { formatJoinCode, inviteSchema } from "@geonex/shared";
import { AuthGuard, AuthService, AuthUser, CurrentUser, OptionalAuthGuard } from "./auth";
import { config } from "./config";
import { Db } from "./db";
import { LibraryService } from "./library";
import { SessionsService } from "./sessions";
import { AttemptLimiter, parse } from "./util";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const INVITE_TTL_MS = 7 * 24 * 3600_000;

/** États réels d'une session dans le moteur : on n'affiche jamais un statut qui n'existe pas. */
export function statusLabel(status: string, archived: boolean): { key: string; label: string } {
  if (archived) return { key: "archived", label: "Archivée" };
  switch (status) {
    case "preparing": case "lobby": return { key: "preparing", label: "En préparation" };
    case "dossier": case "running": return { key: "active", label: "Session active" };
    case "finished": return { key: "finished", label: "Terminée" };
    case "expired": return { key: "expired", label: "Expirée" };
    default: return { key: status, label: status };
  }
}

const SESSION_COLS = `s.id, s.name, s.status, s.created_at, s.archived_at, s.started_at, s.finished_at, s.expected_teams, s.runtime->>'round' AS round, s.runtime->>'roundsPlanned' AS rounds_planned,
  sc.id AS scenario_id, sc.title AS scenario_title, sc.mode, sc.data->'setting'->>'start_label' AS start_label, sc.data->'setting'->>'era' AS era,
  (SELECT count(*) FROM participants x WHERE x.session_id = s.id) AS participants,
  (SELECT max(w.created_at) FROM world_states w WHERE w.session_id = s.id) AS last_activity`;

@Injectable()
export class SpaceService {
  private inviteLimiter = new AttemptLimiter(25, 3600_000);

  constructor(private readonly db: Db, private readonly auth: AuthService, private readonly sessions: SessionsService, private readonly library: LibraryService) {}

  private shape(r: any) {
    const st = statusLabel(r.status, !!r.archived_at);
    return {
      id: r.id, name: r.name, status: st, rawStatus: r.status, createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
      scenario: { id: r.scenario_id, title: r.scenario_title, mode: r.mode, startLabel: r.start_label, era: r.era },
      participants: Number(r.participants), expectedTeams: r.expected_teams, round: r.round ? Number(r.round) : null, roundsPlanned: r.rounds_planned ? Number(r.rounds_planned) : null,
      lastActivity: r.last_activity ?? r.started_at ?? r.created_at,
    };
  }

  async overview(user: AuthUser) {
    const [owned, joined, invites, notes, mine, favKeys] = await Promise.all([
      this.db.query(`SELECT ${SESSION_COLS}, s.code FROM sessions s JOIN scenarios sc ON sc.id = s.scenario_id WHERE s.creator_id = $1 ORDER BY s.created_at DESC LIMIT 100`, [user.id]),
      this.db.query(`SELECT ${SESSION_COLS}, p.role, p.actor_id, p.joined_at, u.display_name AS organizer, u.deleted_at AS organizer_deleted,
         (SELECT a->>'name' FROM jsonb_array_elements(sc.data->'actors') a WHERE a->>'id' = p.actor_id LIMIT 1) AS actor_name
         FROM participants p JOIN sessions s ON s.id = p.session_id JOIN scenarios sc ON sc.id = s.scenario_id JOIN users u ON u.id = s.creator_id
         WHERE p.user_id = $1 AND s.creator_id <> $1 ORDER BY p.joined_at DESC LIMIT 100`, [user.id]),
      this.invitations(user),
      this.db.query("SELECT id, kind, payload, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 15", [user.id]),
      this.db.query(`SELECT s.id, s.title, s.mode, s.created_at, s.visibility, s.publication_status, s.rejection_reason, (SELECT count(*) FROM sessions x WHERE x.scenario_id = s.id) AS sessions,
         s.data->'setting'->>'start_label' AS start_label FROM scenarios s WHERE s.owner_id = $1 ORDER BY s.created_at DESC LIMIT 100`, [user.id]),
      this.library.favoriteKeys(user.id),
    ]);
    const mySessions = owned.map((r) => ({ ...this.shape(r), code: r.status === "lobby" ? formatJoinCode(r.code) : null, archived: !!r.archived_at }));
    const participations = joined.map((r) => ({ ...this.shape(r), role: r.role === "president" ? "Président de séance" : r.actor_name ?? "Rôle attribué au lancement", organizer: r.organizer_deleted ? "Compte supprimé" : r.organizer, joinedAt: r.joined_at }));
    const live = (x: any) => x.status.key === "active" || x.status.key === "preparing";
    const active = [
      ...mySessions.filter((s) => live(s) && !s.archived).map((s) => ({ ...s, relation: "Organisateur", role: "Président de séance" })),
      ...participations.filter(live).map((s) => ({ ...s, relation: "Participant" })),
    ].sort((a, b) => +new Date(b.lastActivity) - +new Date(a.lastActivity));
    const { items } = await this.library.list(user);
    const favorites = [...favKeys].map((key) => items.find((i) => i.key === key)).filter(Boolean);
    return {
      me: await this.auth.me(user), active, mySessions, participations, invitations: invites, favorites, scenarios: mine.map((s) => ({ ...s, sessions: Number(s.sessions) })),
      notifications: notes, unread: notes.filter((n) => !n.read_at).length,
    };
  }

  // ---- sessions de l'organisateur
  private async owned(user: AuthUser, id: string) {
    const s = await this.db.one("SELECT * FROM sessions WHERE id = $1", [id]);
    if (!s) throw new NotFoundException("Session introuvable.");
    if (s.creator_id !== user.id) throw new ForbiddenException("Seul l'organisateur peut effectuer cette action.");
    return s;
  }

  async archive(user: AuthUser, id: string, on: boolean) {
    await this.owned(user, id);
    await this.db.query("UPDATE sessions SET archived_at = $1 WHERE id = $2", [on ? new Date().toISOString() : null, id]);
    return { archived: on };
  }

  /** Suppression : seulement si personne d'autre n'a joué (salon d'attente, session expirée). Sinon l'archivage masque la session sans rien détruire. */
  async remove(user: AuthUser, id: string) {
    const s = await this.owned(user, id);
    if (s.status === "dossier" || s.status === "running") throw new ConflictException("Cette session est en cours : elle ne peut pas être supprimée.");
    if (s.status === "finished") throw new ConflictException("Une session terminée conserve ses archives pour ses participants : archivez-la pour la masquer de votre liste.");
    await this.db.query("DELETE FROM sessions WHERE id = $1", [id]);
    return { deleted: true };
  }

  // ---- invitations
  private expired(r: any) { return r.status === "pending" && new Date(r.expires_at).getTime() < Date.now(); }

  async invitations(user: AuthUser) {
    const rows = await this.db.query(`SELECT i.id, i.status, i.created_at, i.expires_at, i.kind, s.id AS session_id, s.name AS session_name, s.status AS session_status, u.display_name AS from_name, sc.title AS scenario_title, sc.mode
      FROM invitations i JOIN sessions s ON s.id = i.session_id JOIN users u ON u.id = i.from_user JOIN scenarios sc ON sc.id = s.scenario_id
      WHERE i.to_user = $1 ORDER BY i.created_at DESC LIMIT 50`, [user.id]);
    return rows.map((r) => ({ id: r.id, status: this.expired(r) ? "expired" : r.status, createdAt: r.created_at, expiresAt: r.expires_at, from: r.from_name, session: { id: r.session_id, name: r.session_name, status: statusLabel(r.session_status, false), scenario: r.scenario_title, mode: r.mode } }));
  }

  async sessionInvitations(user: AuthUser, sessionId: string) {
    await this.owned(user, sessionId);
    const rows = await this.db.query(`SELECT i.id, i.status, i.kind, i.created_at, i.expires_at, i.to_email, u.display_name AS to_name FROM invitations i LEFT JOIN users u ON u.id = i.to_user WHERE i.session_id = $1 ORDER BY i.created_at DESC LIMIT 100`, [sessionId]);
    return rows.map((r) => ({ id: r.id, kind: r.kind, status: this.expired(r) ? "expired" : r.status, createdAt: r.created_at, expiresAt: r.expires_at, to: r.to_name ?? r.to_email ?? "Lien d'invitation" }));
  }

  async invite(user: AuthUser, sessionId: string, input: unknown) {
    const body = parse(inviteSchema, input);
    const session = await this.owned(user, sessionId);
    if (session.status !== "lobby") throw new ConflictException("On ne peut inviter que pendant l'attente des participants, avant le début de la partie.");
    this.inviteLimiter.check(user.id);
    const pending = await this.db.one("SELECT count(*) AS n FROM invitations WHERE session_id = $1 AND status = 'pending'", [sessionId]);
    if (Number(pending?.n) >= 30) throw new ConflictException("Trop d'invitations en attente pour cette session : révoquez-en avant d'en envoyer d'autres.");
    const expires = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const id = randomUUID();

    if (body.pseudonym) {
      const target = await this.db.one("SELECT id, display_name, prefs FROM users WHERE lower(display_name) = lower($1) AND is_guest = false AND deleted_at IS NULL", [body.pseudonym]);
      // Même réponse si le joueur n'existe pas ou refuse d'être trouvé par son pseudonyme (confidentialité).
      if (!target || target.prefs?.discoverable === false || target.id === user.id) throw new NotFoundException("Aucun joueur ne correspond à ce pseudonyme exact.");
      if (await this.db.one("SELECT id FROM participants WHERE session_id = $1 AND user_id = $2", [sessionId, target.id])) throw new ConflictException("Ce joueur participe déjà à la session.");
      if (await this.db.one("SELECT id FROM invitations WHERE session_id = $1 AND to_user = $2 AND status = 'pending' AND expires_at > now()", [sessionId, target.id])) throw new ConflictException("Une invitation est déjà en attente pour ce joueur.");
      this.inviteLimiter.fail(user.id);
      await this.db.query("INSERT INTO invitations(id, session_id, from_user, to_user, kind, expires_at) VALUES ($1,$2,$3,$4,'user',$5)", [id, sessionId, user.id, target.id, expires]);
      if (target.prefs?.notifications?.invitations !== false) {
        await this.db.query("INSERT INTO notifications(id, user_id, kind, payload) VALUES ($1,$2,'invitation_received',$3)", [randomUUID(), target.id, { invitationId: id, from: user.displayName, session: session.name }]);
      }
      return { id, kind: "user", to: target.display_name };
    }

    const raw = randomBytes(24).toString("base64url");
    const link = `${config.publicUrl}/invite?token=${raw}`;
    this.inviteLimiter.fail(user.id);
    await this.db.query("INSERT INTO invitations(id, session_id, from_user, token_hash, kind, expires_at) VALUES ($1,$2,$3,$4,'link',$5)", [id, sessionId, user.id, sha256(raw), expires]);
    return { id, kind: "link", link };
  }

  async revoke(user: AuthUser, sessionId: string, invitationId: string) {
    await this.owned(user, sessionId);
    const r = await this.db.query("UPDATE invitations SET status = 'revoked', responded_at = now() WHERE id = $1 AND session_id = $2 AND status = 'pending' RETURNING id", [invitationId, sessionId]);
    if (!r.length) throw new NotFoundException("Invitation introuvable ou déjà traitée.");
    return { revoked: true };
  }

  async respond(user: AuthUser, invitationId: string, accept: boolean) {
    const inv = await this.db.one("SELECT i.*, s.name AS session_name FROM invitations i JOIN sessions s ON s.id = i.session_id WHERE i.id = $1 AND i.to_user = $2", [invitationId, user.id]);
    if (!inv) throw new NotFoundException("Invitation introuvable.");
    if (inv.status !== "pending" || this.expired(inv)) throw new ConflictException("Cette invitation n'est plus valable.");
    let sessionId = inv.session_id;
    if (accept) {
      await this.sessions.admitById(user, inv.session_id);
    }
    await this.db.query("UPDATE invitations SET status = $1, responded_at = now() WHERE id = $2 AND status = 'pending'", [accept ? "accepted" : "declined", invitationId]);
    await this.db.query("INSERT INTO notifications(id, user_id, kind, payload) VALUES ($1,$2,$3,$4)", [randomUUID(), inv.from_user, accept ? "invitation_accepted" : "invitation_declined", { from: user.displayName, session: inv.session_name }]);
    return { status: accept ? "accepted" : "declined", sessionId };
  }

  /** Lien d'invitation : aperçu public (le jeton est la preuve d'accès), puis acceptation par un compte connecté. */
  private async byToken(token: string) {
    const inv = await this.db.one(`SELECT i.*, s.name AS session_name, s.status AS session_status, u.display_name AS from_name, u.deleted_at AS from_deleted, sc.title AS scenario_title, sc.mode
      FROM invitations i JOIN sessions s ON s.id = i.session_id JOIN users u ON u.id = i.from_user JOIN scenarios sc ON sc.id = s.scenario_id WHERE i.token_hash = $1`, [sha256(token)]);
    if (!inv) throw new NotFoundException("Ce lien d'invitation est invalide.");
    return inv;
  }

  async preview(token: string) {
    const inv = await this.byToken(String(token ?? ""));
    const valid = inv.status === "pending" && !this.expired(inv) && inv.session_status === "lobby";
    return { valid, reason: valid ? null : inv.status === "revoked" ? "Cette invitation a été révoquée." : this.expired(inv) ? "Cette invitation a expiré." : inv.session_status !== "lobby" ? "Cette session a déjà commencé ou est terminée." : "Cette invitation a déjà été utilisée.",
      session: { name: inv.session_name, scenario: inv.scenario_title, mode: inv.mode }, from: inv.from_deleted ? "Un ancien joueur" : inv.from_name };
  }

  async acceptByToken(user: AuthUser, token: string) {
    const inv = await this.byToken(String(token ?? ""));
    if (inv.status !== "pending" || this.expired(inv)) throw new ConflictException("Cette invitation n'est plus valable.");
    const res = await this.sessions.admitById(user, inv.session_id);
    if (!res.rejoined) await this.db.query("INSERT INTO notifications(id, user_id, kind, payload) VALUES ($1,$2,'invitation_accepted',$3)", [randomUUID(), inv.from_user, { from: user.displayName, session: inv.session_name }]);
    return { sessionId: res.sessionId };
  }

  /** Pastilles de la navigation : invitations en attente et notifications non lues (requête légère). */
  async badge(user: AuthUser) {
    const [i, n] = await Promise.all([
      this.db.one("SELECT count(*) AS n FROM invitations WHERE to_user = $1 AND status = 'pending' AND expires_at > now()", [user.id]),
      this.db.one("SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [user.id]),
    ]);
    return { invitations: Number(i?.n ?? 0), unread: Number(n?.n ?? 0) };
  }

  async readAll(user: AuthUser) {
    await this.db.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [user.id]);
    return { ok: true };
  }
}

@Controller("space")
@UseGuards(AuthGuard)
export class SpaceController {
  constructor(private readonly svc: SpaceService) {}

  @Get("badge")
  badge(@CurrentUser() user: AuthUser) {
    return this.svc.badge(user);
  }

  @Get("overview")
  overview(@CurrentUser() user: AuthUser) {
    return this.svc.overview(user);
  }

  @Post("sessions/:id/archive")
  archive(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.archive(user, id, true);
  }

  @Post("sessions/:id/unarchive")
  unarchive(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.archive(user, id, false);
  }

  @Delete("sessions/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.remove(user, id);
  }

  @Get("sessions/:id/invitations")
  sessionInvitations(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.sessionInvitations(user, id);
  }

  @Post("sessions/:id/invitations")
  invite(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.invite(user, id, body);
  }

  @Delete("sessions/:id/invitations/:iid")
  revoke(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Param("iid", ParseUUIDPipe) iid: string) {
    return this.svc.revoke(user, id, iid);
  }

  @Post("invitations/:id/accept")
  accept(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.respond(user, id, true);
  }

  @Post("invitations/:id/decline")
  decline(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.respond(user, id, false);
  }

  @Post("notifications/read")
  read(@CurrentUser() user: AuthUser) {
    return this.svc.readAll(user);
  }
}

@Controller("invitations")
export class InvitationLinkController {
  constructor(private readonly svc: SpaceService) {}

  @Get("link/:token")
  @UseGuards(OptionalAuthGuard)
  preview(@Param("token") token: string) {
    return this.svc.preview(token);
  }

  @Post("link/:token/accept")
  @UseGuards(AuthGuard)
  accept(@CurrentUser() user: AuthUser, @Param("token") token: string) {
    return this.svc.acceptByToken(user, token);
  }
}
