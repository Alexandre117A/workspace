import { BadRequestException, Controller, Get, Header, Module, NotFoundException, OnModuleInit, Param, Post, UseGuards } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { DURATION_RECOMMENDATION, MIN_DURATION_MINUTES } from "@geonex/shared";
import { ArchivesController, ArchivesService } from "./archives";
import { AuthController, AuthGuard, AuthService, AuthUser, CurrentUser, OptionalAuthGuard, OwnerGuard } from "./auth";
import { testEmail } from "./emails";
import { config } from "./config";
import { Db } from "./db";
import { EngineClient } from "./engine.client";
import { GameGateway } from "./game.gateway";
import { GameService } from "./game.service";
import { Hub } from "./hub";
import { LibraryController, LibraryService, ModerationController, PublicationController } from "./library";
import { Mailer } from "./mailer";
import { ScenariosController, ScenariosService } from "./scenarios";
import { SessionsController, SessionsService } from "./sessions";
import { InvitationLinkController, SpaceController, SpaceService } from "./space";
import { Store } from "./store";

@Controller()
class MetaController {
  constructor(private readonly engine: EngineClient, private readonly mailer: Mailer) {}

  @Get("health")
  async health() {
    let engine: any = null;
    try {
      engine = await this.engine.get("/health");
    } catch {
      engine = { status: "unreachable" };
    }
    return { status: "ok", service: "geonex-api", engine };
  }

  /** Frontières réelles (Natural Earth, domaine public, via world-atlas), chargées à la demande par le client. */
  @Get("geo/:name")
  @Header("cache-control", "public, max-age=604800, immutable")
  @Header("content-type", "application/json")
  geo(@Param("name") name: string) {
    if (!["countries-110m", "countries-50m"].includes(name)) throw new NotFoundException();
    return readFileSync(require.resolve(`world-atlas/${name}.json`), "utf8");
  }

  /** Fiches de scénarios de l'accueil : construites par le moteur à partir de scénarios réels (jamais de texte écrit à la main). */
  private catalogCache: { at: number; data: unknown } | null = null;

  @Get("catalog")
  @Header("cache-control", "public, max-age=600")
  async catalog() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < 600_000) return this.catalogCache.data;
    try {
      const data = await this.engine.get("/catalog");
      this.catalogCache = { at: Date.now(), data };
      return data;
    } catch {
      return { scenarios: [], unavailable: true };
    }
  }

  /** Fonctionnalités réellement disponibles : le client n'affiche jamais une intégration absente comme active. */
  @Get("config")
  async features() {
    let engine: any = null;
    try {
      engine = await this.engine.get("/health");
    } catch {
      /* moteur injoignable */
    }
    return {
      app: "GEONEX",
      minDurationMinutes: MIN_DURATION_MINUTES,
      recommendation: DURATION_RECOMMENDATION,
      features: {
        engine: !!engine,
        ai: !!engine?.ai?.enabled,
        research: !!engine?.research,
        voice: !!(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret),
        ads: config.ads.enabled,
        demo: config.demoMode,
        preview: config.preview,
        mail: this.mailer.configured,
      },
      stableUrl: config.preview ? config.stableUrl : null,
    };
  }
}

/** Administration globale : réservée au propriétaire de GEONEX (jamais au Président de séance). */
@Controller("admin")
@UseGuards(AuthGuard, OwnerGuard)
class AdminController {
  constructor(private readonly db: Db, private readonly engine: EngineClient, private readonly mailer: Mailer) {}

  /** État réel de l'envoi d'e-mails : fournisseur, expéditeur, problèmes de configuration, résultats récents. Aucun secret. */
  @Get("mail")
  async mail() {
    const stats = await this.db.query("SELECT status, count(*) AS n FROM email_outbox WHERE created_at > now() - interval '7 days' GROUP BY status");
    const last = await this.db.query("SELECT kind, status, error, created_at FROM email_outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5");
    return { ...this.mailer.diagnose(), verify: this.mailer.configured ? await this.mailer.verify() : null, last7days: Object.fromEntries(stats.map((r) => [r.status, Number(r.n)])), recentFailures: last, requireVerified: config.requireVerified };
  }

  /** Envoie un message de test à l'adresse de l'administrateur lui-même (jamais à une adresse arbitraire : pas de relais de spam). */
  @Post("mail/test")
  async mailTest(@CurrentUser() user: AuthUser) {
    if (!user.email) throw new BadRequestException("Votre compte n'a pas d'adresse e-mail.");
    const r = await this.mailer.send({ to: user.email, kind: "test", userId: user.id, ...testEmail({ to: user.email }) });
    return { to: user.email, ...r, diagnosis: this.mailer.diagnose() };
  }

  @Get("overview")
  async overview() {
    const users = await this.db.one("SELECT count(*) FILTER (WHERE NOT is_guest) AS accounts, count(*) FILTER (WHERE is_guest) AS guests FROM users");
    const sessions = await this.db.query("SELECT status, count(*) AS n FROM sessions GROUP BY status");
    const usage = await this.db.query("SELECT service, sum(units) AS units, sum(cost_usd) AS cost FROM usage_records GROUP BY service");
    let ai: any = null;
    try {
      ai = (await this.engine.get("/usage")).ai;
    } catch {
      ai = null;
    }
    return { users, sessions, usage, ai, monetization: { ads: config.ads } };
  }

  @Get("sessions")
  sessions() {
    return this.db.query("SELECT id, name, status, expected_teams, duration_minutes, created_at, finished_at FROM sessions ORDER BY created_at DESC LIMIT 100");
  }
}

@Module({
  controllers: [MetaController, AdminController, AuthController, ScenariosController, SessionsController, ArchivesController, LibraryController, PublicationController, ModerationController, SpaceController, InvitationLinkController],
  providers: [Db, Store, Hub, EngineClient, Mailer, AuthService, AuthGuard, OptionalAuthGuard, OwnerGuard, ScenariosService, SessionsService, GameService, ArchivesService, GameGateway, LibraryService, SpaceService],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly db: Db, private readonly game: GameService) {}

  async onModuleInit() {
    await this.db.init();
    await this.db.query("UPDATE sessions SET status='expired' WHERE status='lobby' AND expires_at < now()");
    await this.db.query("UPDATE participants SET connected = false");
    await this.game.restore();
  }
}
