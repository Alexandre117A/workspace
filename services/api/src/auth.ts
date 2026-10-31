import {
  BadRequestException, Body, CanActivate, ConflictException, Controller, createParamDecorator, Delete, ExecutionContext, ForbiddenException, Get, Injectable,
  Patch, Post, Query, Req, UnauthorizedException, UseGuards,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import {
  deleteAccountSchema, emailChangeSchema, forgotSchema, guestSchema, loginSchema, passwordChangeSchema, profileSchema, pseudonymIssues, registerSchema,
  resetSchema, tokenSchema,
} from "@geonex/shared";
import { config } from "./config";
import { Db } from "./db";
import { inviteEmail, resetEmail, verifyEmail, welcomeEmail } from "./emails";
import { Mailer, MailResult } from "./mailer";
import { AttemptLimiter, parse } from "./util";

export interface AuthUser {
  id: string;
  role: "user" | "owner";
  displayName: string;
  isGuest: boolean;
  email?: string | null;
  emailVerified?: boolean;
  tokenVersion?: number;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [, saltHex, hashHex] = stored.split("$");
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const isUnique = (e: any) => e?.code === "23505" || /unique|duplicate/i.test(String(e?.message ?? ""));
const TTL = { verify: 48 * 3600_000, reset: 3600_000, email_change: 24 * 3600_000 } as const;
const RESEND_COOLDOWN_MS = 60_000;
const AVATARS = ["navy", "atlas", "brass", "red", "stone"];

@Injectable()
export class AuthService {
  private loginLimiter = new AttemptLimiter(8, 10 * 60_000);
  private emailLimiter = new AttemptLimiter(20, 10 * 60_000); // contre les attaques réparties sur plusieurs adresses IP
  private registerLimiter = new AttemptLimiter(40, 60 * 60_000); // large : une classe entière peut s'inscrire depuis la même adresse IP
  private forgotLimiter = new AttemptLimiter(6, 60 * 60_000);
  private pseudoLimiter = new AttemptLimiter(300, 60_000);

  constructor(private readonly db: Db, private readonly mailer: Mailer) {}

  sign(user: AuthUser, remember = true): string {
    return jwt.sign({ sub: user.id, role: user.role, name: user.displayName, guest: user.isGuest, tv: user.tokenVersion ?? 0 }, config.jwtSecret, { expiresIn: remember ? "30d" : "1d" });
  }

  /** Lecture du jeton seule (sans base de données) : sert aux contrôles légers. Les routes protégées utilisent `authenticate`. */
  verify(token: string): AuthUser {
    try {
      const p = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      return { id: String(p.sub), role: p.role === "owner" ? "owner" : "user", displayName: p.name, isGuest: !!p.guest, tokenVersion: Number(p.tv ?? 0) };
    } catch {
      throw new UnauthorizedException("Session expirée ou jeton invalide.");
    }
  }

  /** Authentification côté serveur : signature du jeton PUIS état réel du compte (existant, non supprimé, sessions non révoquées). */
  async authenticate(token: string): Promise<AuthUser> {
    const claims = this.verify(token);
    const row = await this.db.one("SELECT id, email, display_name, role, is_guest, token_version, deleted_at, email_verified_at FROM users WHERE id = $1", [claims.id]);
    if (!row || row.deleted_at || Number(row.token_version) !== (claims.tokenVersion ?? 0)) throw new UnauthorizedException("Session expirée : reconnectez-vous.");
    return { id: row.id, role: row.role === "owner" ? "owner" : "user", displayName: row.display_name, isGuest: !!row.is_guest, email: row.email, emailVerified: !!row.email_verified_at, tokenVersion: Number(row.token_version) };
  }

  /** La règle « adresse vérifiée exigée » n'est appliquée que si les e-mails sont opérationnels (configurés et sans série d'échecs) : sinon personne ne pourrait la remplir. */
  mustVerify(): boolean {
    return config.requireVerified && this.mailer.configured && this.mailer.healthy;
  }

  /** Refuse l'accès aux parties (création, admission) tant que l'adresse n'est pas vérifiée, quand la règle est active. */
  assertVerified(user: AuthUser): void {
    if (this.mustVerify() && !user.emailVerified) {
      throw new ForbiddenException("Confirmez votre adresse e-mail pour continuer : ouvrez le lien reçu à l'inscription, ou demandez-en un nouveau depuis Mon espace, onglet Mon profil.");
    }
  }

  /** Droits d'administration : adresse listée dans GEONEX_OWNER_EMAILS ET vérifiée (si l'envoi d'e-mails est opérationnel). Jamais le pseudonyme. */
  private roleFor(email: string | null, verified: boolean): "user" | "owner" {
    if (!email || !config.ownerEmails.includes(email.toLowerCase())) return "user";
    return verified || !this.mailer.configured ? "owner" : "user";
  }

  private async newToken(userId: string, kind: keyof typeof TTL, newEmail?: string): Promise<string> {
    const raw = randomBytes(32).toString("base64url");
    await this.db.query("INSERT INTO email_tokens(id, user_id, kind, token_hash, new_email, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [randomUUID(), userId, kind, sha256(raw), newEmail ?? null, new Date(Date.now() + TTL[kind]).toISOString()]);
    return raw;
  }

  private async recentToken(userId: string, kind: string): Promise<boolean> {
    const r = await this.db.one("SELECT created_at FROM email_tokens WHERE user_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 1", [userId, kind]);
    return !!r && Date.now() - new Date(r.created_at).getTime() < RESEND_COOLDOWN_MS;
  }

  private async pseudonymTaken(pseudonym: string, exceptId?: string): Promise<boolean> {
    return !!(await this.db.one("SELECT id FROM users WHERE lower(display_name) = lower($1) AND is_guest = false AND deleted_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)", [pseudonym, exceptId ?? null]));
  }

  async pseudonymAvailable(value: string, ip: string) {
    this.pseudoLimiter.check(ip);
    this.pseudoLimiter.fail(ip);
    const issues = pseudonymIssues(String(value ?? ""));
    if (issues.length) return { available: false, reason: issues[0] };
    return (await this.pseudonymTaken(value.trim())) ? { available: false, reason: "Ce pseudonyme est déjà utilisé." } : { available: true };
  }

  private async sendWelcome(userId: string, pseudonym: string, email: string): Promise<MailResult> {
    const token = await this.newToken(userId, "verify");
    return this.mailer.send({ to: email, kind: "welcome", userId, ...welcomeEmail({ pseudonym, verifyUrl: `${config.publicUrl}/verify?token=${token}` }) });
  }

  async register(input: unknown, ip: string, upgradeFrom?: AuthUser) {
    const { email, pseudonym, password } = parse(registerSchema, input);
    this.registerLimiter.check(ip);
    this.registerLimiter.fail(ip);
    if (await this.pseudonymTaken(pseudonym, upgradeFrom?.id)) throw new ConflictException("Ce pseudonyme est déjà utilisé.");
    if (await this.db.one("SELECT id FROM users WHERE email = $1", [email])) throw new ConflictException("Cette adresse e-mail est déjà associée à un compte.");
    const role = this.roleFor(email, false);
    const id = upgradeFrom?.id ?? randomUUID();
    try {
      if (upgradeFrom) {
        await this.db.query("UPDATE users SET email=$1, password_hash=$2, display_name=$3, is_guest=false, role=$4, token_version=token_version+1 WHERE id=$5 AND is_guest = true", [email, hashPassword(password), pseudonym, role, id]);
      } else {
        await this.db.query("INSERT INTO users(id, email, password_hash, display_name, role, is_guest) VALUES ($1,$2,$3,$4,$5,false)", [id, email, hashPassword(password), pseudonym, role]);
      }
    } catch (e) {
      if (isUnique(e)) throw new ConflictException("Ce pseudonyme ou cette adresse e-mail est déjà utilisé.");
      throw e;
    }
    const row = await this.db.one("SELECT token_version FROM users WHERE id = $1", [id]);
    const user: AuthUser = { id, role, displayName: pseudonym, isGuest: false, email, emailVerified: false, tokenVersion: Number(row?.token_version ?? 0) };
    // Le compte existe déjà : un incident d'envoi ne l'annule jamais, l'état réel de l'e-mail est renvoyé.
    const mail = await this.sendWelcome(id, pseudonym, email);
    return { token: this.sign(user), user, email: mail };
  }

  async login(input: unknown, ip: string) {
    const { email, password, remember } = parse(loginSchema, input);
    const keys = [`ip:${ip}:${email}`, `email:${email}`];
    this.loginLimiter.check(keys[0]);
    this.emailLimiter.check(keys[1]);
    const row = await this.db.one("SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL", [email]);
    if (!row || !verifyPassword(password, row.password_hash)) {
      this.loginLimiter.fail(keys[0]);
      this.emailLimiter.fail(keys[1]);
      throw new UnauthorizedException("Adresse e-mail ou mot de passe incorrect.");
    }
    this.loginLimiter.reset(keys[0]);
    const role = this.roleFor(email, !!row.email_verified_at);
    await this.db.query("UPDATE users SET role = $1, last_login_at = now() WHERE id = $2", [role, row.id]);
    const user: AuthUser = { id: row.id, role, displayName: row.display_name, isGuest: false, email, emailVerified: !!row.email_verified_at, tokenVersion: Number(row.token_version) };
    return { token: this.sign(user, remember), user };
  }

  async guest(input: unknown) {
    const { displayName } = parse(guestSchema, input);
    const user: AuthUser = { id: randomUUID(), role: "user", displayName, isGuest: true, tokenVersion: 0 };
    await this.db.query("INSERT INTO users(id, display_name, role, is_guest) VALUES ($1,$2,'user',true)", [user.id, displayName]);
    return { token: this.sign(user), user };
  }

  async upgrade(user: AuthUser, input: unknown, ip: string) {
    if (!user.isGuest) throw new ForbiddenException("Ce compte est déjà enregistré.");
    return this.register(input, ip, user);
  }

  async me(user: AuthUser) {
    const row = await this.db.one("SELECT id, email, display_name, role, is_guest, created_at, email_verified_at, prefs FROM users WHERE id = $1", [user.id]);
    if (!row) throw new UnauthorizedException("Compte introuvable.");
    const prefs = row.prefs ?? {};
    return {
      id: row.id, email: row.email, displayName: row.display_name, role: row.role, isGuest: row.is_guest, createdAt: row.created_at,
      emailVerified: !!row.email_verified_at, avatarColor: AVATARS.includes(prefs.avatarColor) ? prefs.avatarColor : "navy",
      notifications: { invitations: prefs.notifications?.invitations !== false, product: prefs.notifications?.product === true }, discoverable: prefs.discoverable !== false,
      mail: { configured: this.mailer.configured }, requireVerified: this.mustVerify(),
    };
  }

  /** Mot de passe oublié : la réponse est toujours la même, que l'adresse existe ou non (pas d'énumération des comptes). */
  async forgot(input: unknown, ip: string) {
    const { email } = parse(forgotSchema, input);
    this.forgotLimiter.check(`ip:${ip}`);
    this.forgotLimiter.fail(`ip:${ip}`);
    this.forgotLimiter.check(`e:${email}`);
    this.forgotLimiter.fail(`e:${email}`);
    const row = await this.db.one("SELECT id, display_name FROM users WHERE email = $1 AND is_guest = false AND deleted_at IS NULL", [email]);
    if (row && !(await this.recentToken(row.id, "reset"))) {
      const token = await this.newToken(row.id, "reset");
      await this.mailer.send({ to: email, kind: "reset", userId: row.id, ...resetEmail({ pseudonym: row.display_name, resetUrl: `${config.publicUrl}/reset?token=${token}` }) });
    }
    return { ok: true };
  }

  private async consume(token: string, kind: string) {
    const row = await this.db.one("SELECT * FROM email_tokens WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()", [sha256(token), kind]);
    if (!row) throw new BadRequestException("Ce lien est invalide ou a expiré.");
    // Usage unique, même en cas de double clic simultané : seule la requête qui marque le jeton comme utilisé réussit.
    const claimed = await this.db.query("UPDATE email_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id", [row.id]);
    if (!claimed.length) throw new BadRequestException("Ce lien est invalide ou a expiré.");
    return row;
  }

  async reset(input: unknown) {
    const { token, password } = parse(resetSchema, input);
    const t = await this.consume(token, "reset");
    await this.db.query("UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2", [hashPassword(password), t.user_id]);
    await this.db.query("UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND kind = 'reset' AND used_at IS NULL", [t.user_id]);
    return { ok: true };
  }

  async verifyToken(input: unknown) {
    const { token } = parse(tokenSchema, input);
    const peek = await this.db.one("SELECT kind FROM email_tokens WHERE token_hash = $1", [sha256(token)]);
    if (peek?.kind === "email_change") {
      const t = await this.consume(token, "email_change");
      if (await this.db.one("SELECT id FROM users WHERE email = $1 AND id <> $2", [t.new_email, t.user_id])) throw new ConflictException("Cette adresse e-mail est déjà associée à un compte.");
      await this.db.query("UPDATE users SET email = $1, email_verified_at = now(), role = $2 WHERE id = $3", [t.new_email, this.roleFor(t.new_email, true), t.user_id]);
      return { ok: true, kind: "email_change" };
    }
    const t = await this.consume(token, "verify");
    const u = await this.db.one("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 RETURNING email", [t.user_id]);
    if (u) await this.db.query("UPDATE users SET role = $1 WHERE id = $2", [this.roleFor(u.email, true), t.user_id]);
    return { ok: true, kind: "verify" };
  }

  async resendVerification(user: AuthUser) {
    const row = await this.db.one("SELECT email, display_name, email_verified_at, is_guest FROM users WHERE id = $1", [user.id]);
    if (!row || row.is_guest || !row.email) throw new ForbiddenException("Créez d'abord un compte.");
    if (row.email_verified_at) return { status: "already", configured: this.mailer.configured };
    if (await this.recentToken(user.id, "verify")) throw new BadRequestException("Un message vient d'être envoyé : patientez une minute avant d'en demander un autre.");
    const token = await this.newToken(user.id, "verify");
    const mail = await this.mailer.send({ to: row.email, kind: "verify", userId: user.id, ...verifyEmail({ pseudonym: row.display_name, verifyUrl: `${config.publicUrl}/verify?token=${token}` }) });
    return { status: mail.status, configured: mail.configured };
  }

  async updateProfile(user: AuthUser, input: unknown) {
    if (user.isGuest) throw new ForbiddenException("Créez d'abord un compte.");
    const p = parse(profileSchema, input);
    if (p.pseudonym && p.pseudonym !== user.displayName) {
      if (await this.pseudonymTaken(p.pseudonym, user.id)) throw new ConflictException("Ce pseudonyme est déjà utilisé.");
      try {
        await this.db.query("UPDATE users SET display_name = $1 WHERE id = $2", [p.pseudonym, user.id]);
      } catch (e) {
        if (isUnique(e)) throw new ConflictException("Ce pseudonyme est déjà utilisé.");
        throw e;
      }
    }
    const row = await this.db.one("SELECT prefs FROM users WHERE id = $1", [user.id]);
    const prefs = { ...(row?.prefs ?? {}) };
    if (p.avatarColor) prefs.avatarColor = p.avatarColor;
    if (p.notifications) prefs.notifications = { ...(prefs.notifications ?? {}), ...p.notifications };
    if (p.discoverable !== undefined) prefs.discoverable = p.discoverable;
    await this.db.query("UPDATE users SET prefs = $1 WHERE id = $2", [prefs, user.id]);
    const fresh = await this.me({ ...user, displayName: p.pseudonym ?? user.displayName });
    return { user: fresh, token: this.sign({ ...user, displayName: fresh.displayName } as AuthUser) };
  }

  async requestEmailChange(user: AuthUser, input: unknown) {
    const { email, password } = parse(emailChangeSchema, input);
    const row = await this.db.one("SELECT password_hash, display_name FROM users WHERE id = $1 AND is_guest = false", [user.id]);
    if (!row || !verifyPassword(password, row.password_hash)) throw new UnauthorizedException("Mot de passe incorrect.");
    if (await this.db.one("SELECT id FROM users WHERE email = $1", [email])) throw new ConflictException("Cette adresse e-mail est déjà associée à un compte.");
    if (await this.recentToken(user.id, "email_change")) throw new BadRequestException("Une demande vient d'être envoyée : patientez une minute.");
    const token = await this.newToken(user.id, "email_change", email);
    const mail = await this.mailer.send({ to: email, kind: "email_change", userId: user.id, ...verifyEmail({ pseudonym: row.display_name, change: true, verifyUrl: `${config.publicUrl}/verify?token=${token}` }) });
    return { status: mail.status, configured: mail.configured };
  }

  async changePassword(user: AuthUser, input: unknown) {
    const { current, next } = parse(passwordChangeSchema, input);
    const row = await this.db.one("SELECT password_hash FROM users WHERE id = $1 AND is_guest = false", [user.id]);
    if (!row || !verifyPassword(current, row.password_hash)) throw new UnauthorizedException("Mot de passe actuel incorrect.");
    const upd = await this.db.one("UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING token_version", [hashPassword(next), user.id]);
    return { token: this.sign({ ...user, tokenVersion: Number(upd?.token_version ?? 0) }) };
  }

  /** Déconnecte tous les appareils (révocation des jetons) ; l'appareil courant reçoit un jeton neuf. */
  async logoutAll(user: AuthUser) {
    const upd = await this.db.one("UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version", [user.id]);
    return { token: this.sign({ ...user, tokenVersion: Number(upd?.token_version ?? 0) }) };
  }

  /**
   * Suppression du compte. Les parties en cours dont l'utilisateur est l'organisateur bloquent la suppression (les autres participants ne
   * perdent jamais leur partie). Le compte est anonymisé plutôt que effacé quand des données partagées le référencent (parties jouées).
   */
  async deleteAccount(user: AuthUser, input: unknown) {
    const { password } = parse(deleteAccountSchema, input ?? {});
    const row = await this.db.one("SELECT password_hash, is_guest FROM users WHERE id = $1", [user.id]);
    if (!row) throw new UnauthorizedException();
    if (!row.is_guest && !verifyPassword(password ?? "", row.password_hash)) throw new UnauthorizedException("Mot de passe incorrect.");
    const active = await this.db.one("SELECT count(*) AS n FROM sessions WHERE creator_id = $1 AND status IN ('dossier','running')", [user.id]);
    if (Number(active?.n) > 0) throw new ConflictException("Vous organisez une session en cours : terminez-la avant de supprimer votre compte, afin de ne pas interrompre les autres participants.");
    await this.db.query("DELETE FROM sessions WHERE creator_id = $1 AND status IN ('lobby','expired','preparing')", [user.id]);
    await this.db.query("DELETE FROM scenarios s WHERE s.owner_id = $1 AND NOT EXISTS (SELECT 1 FROM sessions x WHERE x.scenario_id = s.id)", [user.id]);
    await this.db.query("UPDATE scenarios SET visibility = 'private', publication_status = 'none' WHERE owner_id = $1", [user.id]);
    await this.db.query("DELETE FROM invitations WHERE from_user = $1 OR to_user = $1", [user.id]);
    await this.db.query("DELETE FROM notifications WHERE user_id = $1", [user.id]);
    await this.db.query("DELETE FROM scenario_favorites WHERE user_id = $1", [user.id]);
    await this.db.query("DELETE FROM email_tokens WHERE user_id = $1", [user.id]);
    await this.db.query("UPDATE users SET email = NULL, password_hash = NULL, display_name = 'Compte supprimé', is_guest = true, prefs = '{}'::jsonb, deleted_at = now(), token_version = token_version + 1 WHERE id = $1", [user.id]);
    return { deleted: true };
  }

  /** Invitation par e-mail : message HTML + texte, avec lien personnel. */
  async sendInviteMail(to: string, from: string, session: string, token: string, userId?: string | null) {
    return this.mailer.send({ to, kind: "invitation", userId: userId ?? null, ...inviteEmail({ from, session, url: `${config.publicUrl}/invite?token=${token}` }) });
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers["authorization"];
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Authentification requise.");
    req.user = await this.auth.authenticate(header.slice(7));
    return true;
  }
}

/** Authentification facultative : renseigne `req.user` si un jeton valide est présent (pages publiques personnalisées), sans jamais refuser. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers["authorization"];
    if (header?.startsWith("Bearer ")) req.user = await this.auth.authenticate(header.slice(7)).catch(() => undefined);
    return true;
  }
}

/** Rôle propriétaire de l'application (distinct du Président de séance). */
@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.user?.role !== "owner") throw new ForbiddenException("Réservé au propriétaire de GEONEX.");
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() body: unknown, @Req() req: any) {
    return this.auth.register(body, req.ip ?? "unknown");
  }

  @Get("pseudonym")
  pseudonym(@Query("value") value: string, @Req() req: any) {
    return this.auth.pseudonymAvailable(value, req.ip ?? "unknown");
  }

  @Post("login")
  login(@Body() body: unknown, @Req() req: any) {
    return this.auth.login(body, req.ip ?? "unknown");
  }

  @Post("guest")
  guest(@Body() body: unknown) {
    return this.auth.guest(body);
  }

  @Post("upgrade")
  @UseGuards(AuthGuard)
  upgrade(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() req: any) {
    return this.auth.upgrade(user, body, req.ip ?? "unknown");
  }

  @Post("forgot")
  forgot(@Body() body: unknown, @Req() req: any) {
    return this.auth.forgot(body, req.ip ?? "unknown");
  }

  @Post("reset")
  reset(@Body() body: unknown) {
    return this.auth.reset(body);
  }

  @Post("verify")
  verify(@Body() body: unknown) {
    return this.auth.verifyToken(body);
  }

  @Post("resend-verification")
  @UseGuards(AuthGuard)
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Patch("profile")
  @UseGuards(AuthGuard)
  profile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.updateProfile(user, body);
  }

  @Post("email")
  @UseGuards(AuthGuard)
  email(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.requestEmailChange(user, body);
  }

  @Post("password")
  @UseGuards(AuthGuard)
  password(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.changePassword(user, body);
  }

  @Post("logout-all")
  @UseGuards(AuthGuard)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user);
  }

  @Delete("me")
  @UseGuards(AuthGuard)
  remove(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.deleteAccount(user, body);
  }
}
