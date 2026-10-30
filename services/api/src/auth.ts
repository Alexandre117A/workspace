import {
  Body, CanActivate, Controller, createParamDecorator, Delete, ExecutionContext, ForbiddenException, Get, Injectable,
  Post, Req, UnauthorizedException, UseGuards,
} from "@nestjs/common";
import { randomUUID, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { credentialsSchema, guestSchema } from "@geonex/shared";
import { config } from "./config";
import { Db } from "./db";
import { AttemptLimiter, parse } from "./util";

export interface AuthUser {
  id: string;
  role: "user" | "owner";
  displayName: string;
  isGuest: boolean;
  email?: string | null;
}

function hashPassword(password: string): string {
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

@Injectable()
export class AuthService {
  private limiter = new AttemptLimiter(8, 10 * 60_000);
  constructor(private readonly db: Db) {}

  sign(user: AuthUser): string {
    return jwt.sign({ sub: user.id, role: user.role, name: user.displayName, guest: user.isGuest }, config.jwtSecret, { expiresIn: "30d" });
  }

  verify(token: string): AuthUser {
    try {
      const p = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      return { id: String(p.sub), role: p.role === "owner" ? "owner" : "user", displayName: p.name, isGuest: !!p.guest };
    } catch {
      throw new UnauthorizedException("Session expirée ou jeton invalide.");
    }
  }

  private roleFor(email: string | null): "user" | "owner" {
    return email && config.ownerEmails.includes(email.toLowerCase()) ? "owner" : "user";
  }

  async register(input: unknown) {
    const { email, password, displayName } = parse(credentialsSchema, input);
    if (await this.db.one("SELECT id FROM users WHERE email = $1", [email])) throw new ForbiddenException("Un compte existe déjà avec cette adresse.");
    const user: AuthUser = { id: randomUUID(), role: this.roleFor(email), displayName: displayName ?? email.split("@")[0], isGuest: false, email };
    await this.db.query("INSERT INTO users(id, email, password_hash, display_name, role, is_guest) VALUES ($1,$2,$3,$4,$5,false)",
      [user.id, email, hashPassword(password), user.displayName, user.role]);
    return { token: this.sign(user), user };
  }

  async login(input: unknown, ip: string) {
    const { email, password } = parse(credentialsSchema.pick({ email: true, password: true }), input);
    const key = `login:${ip}:${email}`;
    this.limiter.check(key);
    const row = await this.db.one("SELECT * FROM users WHERE email = $1", [email]);
    if (!row || !verifyPassword(password, row.password_hash)) {
      this.limiter.fail(key);
      throw new UnauthorizedException("Adresse ou mot de passe incorrect.");
    }
    this.limiter.reset(key);
    const role = this.roleFor(email);
    if (role !== row.role) await this.db.query("UPDATE users SET role = $1 WHERE id = $2", [role, row.id]);
    const user: AuthUser = { id: row.id, role, displayName: row.display_name, isGuest: false, email };
    return { token: this.sign(user), user };
  }

  async guest(input: unknown) {
    const { displayName } = parse(guestSchema, input);
    const user: AuthUser = { id: randomUUID(), role: "user", displayName, isGuest: true };
    await this.db.query("INSERT INTO users(id, display_name, role, is_guest) VALUES ($1,$2,'user',true)", [user.id, displayName]);
    return { token: this.sign(user), user };
  }

  async upgrade(user: AuthUser, input: unknown) {
    const { email, password, displayName } = parse(credentialsSchema, input);
    if (!user.isGuest) throw new ForbiddenException("Ce compte est déjà enregistré.");
    if (await this.db.one("SELECT id FROM users WHERE email = $1", [email])) throw new ForbiddenException("Un compte existe déjà avec cette adresse.");
    const role = this.roleFor(email);
    await this.db.query("UPDATE users SET email=$1, password_hash=$2, display_name=COALESCE($3, display_name), is_guest=false, role=$4 WHERE id=$5",
      [email, hashPassword(password), displayName ?? null, role, user.id]);
    const next: AuthUser = { ...user, isGuest: false, email, role, displayName: displayName ?? user.displayName };
    return { token: this.sign(next), user: next };
  }

  async me(user: AuthUser) {
    const row = await this.db.one("SELECT id, email, display_name, role, is_guest, created_at FROM users WHERE id = $1", [user.id]);
    if (!row) throw new UnauthorizedException("Compte introuvable.");
    return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, isGuest: row.is_guest, createdAt: row.created_at };
  }

  async deleteAccount(user: AuthUser) {
    // Droit à l'effacement : les scénarios et participations sont supprimés en cascade.
    await this.db.query("DELETE FROM sessions WHERE creator_id = $1 AND status IN ('lobby','expired')", [user.id]);
    await this.db.query("UPDATE users SET email = NULL, password_hash = NULL, display_name = 'Compte supprimé', is_guest = true WHERE id = $1", [user.id]);
    return { deleted: true };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers["authorization"];
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Authentification requise.");
    req.user = this.auth.verify(header.slice(7));
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
  register(@Body() body: unknown) {
    return this.auth.register(body);
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
  upgrade(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.upgrade(user, body);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Delete("me")
  @UseGuards(AuthGuard)
  remove(@CurrentUser() user: AuthUser) {
    return this.auth.deleteAccount(user);
  }
}
