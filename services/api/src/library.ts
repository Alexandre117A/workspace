import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { complexityOf, publishSchema } from "@geonex/shared";
import { z } from "zod";
import { AuthGuard, AuthUser, CurrentUser, OptionalAuthGuard, OwnerGuard } from "./auth";
import { config } from "./config";
import { Db } from "./db";
import { EngineClient } from "./engine.client";
import { AttemptLimiter, parse } from "./util";

/** Fiche de la bibliothèque : une forme commune pour les fiches officielles, les scénarios communautaires publiés et les scénarios privés de l'utilisateur. */
export interface LibraryItem {
  key: string;
  source: "official" | "community" | "mine";
  mode: "contemporary" | "historical" | "fictional";
  title: string;
  summary: string;
  startLabel: string;
  eraId: string;
  eraLabel: string;
  eraGroup: string;
  regionGroup: string;
  region: string;
  actors: { id: string; name: string; kind?: string; leader?: string | null; region?: { lat: number | null; lon: number | null } | null }[];
  zones: number;
  complexity: string;
  keywords: string[];
  author: string | null;
  prompt?: string;
  scenarioId?: string;
  publication?: { status: string; reason?: string | null };
  theatre: { name: string; iso_n3: string[]; center: [number, number] | null; maritime: boolean; basemap: string; atlas_style: string; map_note: string | null; zones: { name: string; lat: number | null; lon: number | null }[] };
  favorite?: boolean;
  createdAt?: string;
}

const ERA_GROUP: Record<string, string> = {
  ancient: "Antiquité", medieval: "Moyen Âge", early_modern: "Époque moderne", napoleonic: "XIXe siècle", industrial: "XIXe siècle",
  cold_war: "Guerre froide", contemporary: "Monde contemporain", space: "Futur ou univers alternatif", fantasy: "Futur ou univers alternatif",
};
const ERA_LABEL: Record<string, string> = {
  ancient: "Antiquité", medieval: "Moyen Âge", early_modern: "Époque moderne", napoleonic: "Époque napoléonienne", industrial: "Ère industrielle",
  cold_war: "Guerre froide", contemporary: "Monde contemporain", space: "Univers spatial fictif", fantasy: "Univers imaginaire",
};
const ATLAS_STYLE: Record<string, string> = { ancient: "manuscript", medieval: "manuscript", early_modern: "engraved", napoleonic: "staff", industrial: "staff", cold_war: "briefing", contemporary: "modern", space: "fiction", fantasy: "fiction" };

/** Même politique que le moteur (`atlas.py`) : jamais de frontières actuelles présentées comme historiques. */
function basemapFor(era: string, mapKind: string): string {
  if (mapKind === "fictional" || era === "space" || era === "fantasy") return "schematic";
  return era === "contemporary" || era === "cold_war" ? "borders" : "land";
}

/** Grande région d'un théâtre, d'après son centre géographique (approximation par boîtes englobantes, documentée). */
export function regionGroup(center: [number, number] | null | undefined, fictional: boolean): string {
  if (fictional) return "Univers fictif";
  if (!center) return "Monde";
  const [lon, lat] = center;
  if (lat < -10 && lon > 105) return "Océanie";
  if (lon >= 25 && lon <= 62 && lat >= 12 && lat <= 42) return "Moyen-Orient";
  if (lon >= -26 && lon <= 45 && lat >= 35 && lat <= 72) return "Europe";
  if (lon >= -20 && lon <= 55 && lat >= -36 && lat < 35) return "Afrique";
  if (lon >= 60 && lon <= 180 && lat >= -12 && lat <= 78) return "Asie";
  if (lon >= -170 && lon <= -30) return "Amériques";
  return "Monde";
}

function fromRow(r: any, source: "community" | "mine", me?: string): LibraryItem {
  const st = r.setting ?? {};
  const th = st.theatre ?? {};
  const era = st.era ?? "contemporary";
  const fictional = th.map_kind === "fictional";
  const basemap = basemapFor(era, th.map_kind ?? "natural_earth");
  const actors = (r.actors ?? []).map((a: any) => ({ id: a.id, name: a.name, kind: a.kind, leader: a.leader ?? null, region: a.region ? { lat: a.region.lat ?? null, lon: a.region.lon ?? null } : null }));
  const pub = r.publication ?? {};
  return {
    key: source === "community" ? `user:${r.id}` : `mine:${r.id}`, source, mode: r.mode, title: pub.title || r.title, summary: pub.description || r.summary || "",
    startLabel: st.start_label ?? "", eraId: era, eraLabel: ERA_LABEL[era] ?? era, eraGroup: ERA_GROUP[era] ?? "Monde contemporain",
    regionGroup: regionGroup(th.center, fictional), region: th.name ?? "", actors, zones: Number(r.zones ?? 0), complexity: complexityOf(actors.length), keywords: pub.keywords ?? [],
    author: source === "community" ? (r.deleted_at ? "Compte supprimé" : r.author) : me ?? null, scenarioId: r.id,
    publication: source === "mine" ? { status: r.publication_status, reason: r.rejection_reason } : undefined,
    theatre: { name: th.name ?? "", iso_n3: th.iso_n3 ?? [], center: th.center ?? null, maritime: !!th.maritime, basemap, atlas_style: ATLAS_STYLE[era] ?? "modern", map_note: null, zones: r.zone_points ?? [] },
    createdAt: r.created_at,
  };
}

const ROW_SQL = `s.id, s.mode, s.title, s.summary, s.publication, s.publication_status, s.rejection_reason, s.created_at,
  s.data->'setting' AS setting, jsonb_array_length(COALESCE(s.data->'zones','[]'::jsonb)) AS zones,
  (SELECT jsonb_agg(jsonb_build_object('id', a->>'id', 'name', a->>'name', 'kind', a->>'kind', 'leader', a->>'leader', 'region', a->'regions'->0)) FROM jsonb_array_elements(s.data->'actors') a) AS actors,
  (SELECT jsonb_agg(jsonb_build_object('name', z->>'name', 'lat', (z->'region'->>'lat')::float, 'lon', (z->'region'->>'lon')::float)) FROM jsonb_array_elements(COALESCE(s.data->'zones','[]'::jsonb)) z) AS zone_points`;

@Injectable()
export class LibraryService {
  private official: { at: number; items: LibraryItem[] } | null = null;
  private reportLimiter = new AttemptLimiter(5, 3600_000);
  private publishLimiter = new AttemptLimiter(10, 24 * 3600_000);

  constructor(private readonly db: Db, private readonly engine: EngineClient) {}

  /** Fiches officielles : construites par le moteur à partir de scénarios réels (jamais écrites à la main). */
  async officialItems(): Promise<LibraryItem[]> {
    if (this.official && Date.now() - this.official.at < 600_000) return this.official.items;
    let cat: any[] = [];
    try {
      cat = (await this.engine.get<any>("/catalog")).scenarios ?? [];
    } catch {
      return this.official?.items ?? [];
    }
    const items: LibraryItem[] = cat.map((e) => ({
      key: e.id, source: "official", mode: e.mode, title: e.title, summary: e.summary, startLabel: e.start_label, eraId: e.era, eraLabel: e.era_label,
      eraGroup: ERA_GROUP[e.era] ?? "Monde contemporain", regionGroup: regionGroup(e.theatre.center, e.theatre.basemap === "schematic"), region: e.region,
      actors: e.actors.map((a: any) => ({ id: a.id, name: a.name, kind: a.kind, leader: a.leader, region: a.regions?.[0] ? { lat: a.regions[0].lat, lon: a.regions[0].lon } : null })),
      zones: e.counts.zones, complexity: complexityOf(e.counts.actors), keywords: [], author: "GEONEX", prompt: e.prompt,
      theatre: { name: e.theatre.name, iso_n3: e.theatre.iso_n3, center: e.theatre.center, maritime: e.theatre.maritime, basemap: e.theatre.basemap, atlas_style: e.theatre.atlas_style, map_note: e.theatre.map_note,
        zones: e.zones.map((z: any) => ({ name: z.name, lat: z.region.lat, lon: z.region.lon })) },
    }));
    this.official = { at: Date.now(), items };
    return items;
  }

  async communityItems(): Promise<LibraryItem[]> {
    const rows = await this.db.query(`SELECT ${ROW_SQL}, u.display_name AS author, u.deleted_at FROM scenarios s JOIN users u ON u.id = s.owner_id WHERE s.visibility = 'public' AND s.publication_status = 'published' ORDER BY s.published_at DESC LIMIT 200`);
    return rows.map((r) => fromRow(r, "community"));
  }

  async mineItems(user: AuthUser): Promise<LibraryItem[]> {
    const rows = await this.db.query(`SELECT ${ROW_SQL} FROM scenarios s WHERE s.owner_id = $1 AND NOT (s.visibility = 'public' AND s.publication_status = 'published') ORDER BY s.created_at DESC LIMIT 100`, [user.id]);
    return rows.map((r) => fromRow(r, "mine", user.displayName));
  }

  async favoriteKeys(userId: string): Promise<Set<string>> {
    return new Set((await this.db.query("SELECT scenario_key FROM scenario_favorites WHERE user_id = $1", [userId])).map((r) => r.scenario_key));
  }

  async list(user?: AuthUser) {
    const [official, community] = await Promise.all([this.officialItems(), this.communityItems()]);
    const mine = user ? await this.mineItems(user) : [];
    const favs = user ? await this.favoriteKeys(user.id) : new Set<string>();
    return { items: [...official, ...community, ...mine].map((i) => ({ ...i, favorite: favs.has(i.key) })), signedIn: !!user };
  }

  async find(key: string, user?: AuthUser): Promise<LibraryItem> {
    const { items } = await this.list(user);
    const item = items.find((i) => i.key === key);
    if (!item) throw new NotFoundException("Scénario introuvable ou non public.");
    return item;
  }

  async setFavorite(user: AuthUser, key: string, on: boolean) {
    if (on) {
      const { items } = await this.list(user);
      if (!items.some((i) => i.key === key)) throw new NotFoundException("Scénario introuvable ou non public.");
      await this.db.query("INSERT INTO scenario_favorites(user_id, scenario_key) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, key]);
    } else {
      await this.db.query("DELETE FROM scenario_favorites WHERE user_id = $1 AND scenario_key = $2", [user.id, key]);
    }
    return { key, favorite: on };
  }

  /** « Commencer » depuis un scénario communautaire : copie privée au nom de l'utilisateur (l'original n'est jamais modifié). */
  async fork(user: AuthUser, scenarioId: string) {
    const row = await this.db.one("SELECT * FROM scenarios WHERE id = $1 AND visibility = 'public' AND publication_status = 'published'", [scenarioId]);
    if (!row) throw new NotFoundException("Scénario introuvable ou non public.");
    const id = randomUUID();
    const data = { ...row.data, id };
    await this.db.query("INSERT INTO scenarios(id, owner_id, mode, title, prompt, summary, data, provider, parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, user.id, row.mode, row.title, row.prompt, row.summary, data, row.provider, row.id]);
    return { scenarioId: id };
  }

  async publish(user: AuthUser, scenarioId: string, input: unknown) {
    if (user.isGuest) throw new ForbiddenException("Créez un compte pour proposer un scénario à la bibliothèque.");
    this.publishLimiter.check(user.id);
    const p = parse(publishSchema, input);
    if ((`${p.title} ${p.description}`.match(/https?:\/\//gi) ?? []).length > 2) throw new BadRequestException("Deux liens au plus dans la présentation d'un scénario public.");
    const row = await this.db.one("SELECT id FROM scenarios WHERE id = $1 AND owner_id = $2", [scenarioId, user.id]);
    if (!row) throw new NotFoundException("Scénario introuvable.");
    this.publishLimiter.fail(user.id);
    const status = config.moderation ? "pending" : "published";
    await this.db.query("UPDATE scenarios SET publication = $1, publication_status = $2, visibility = $3, published_at = $4, rejection_reason = NULL WHERE id = $5",
      [{ title: p.title, description: p.description, keywords: p.keywords }, status, status === "published" ? "public" : "private", status === "published" ? new Date().toISOString() : null, scenarioId]);
    return { status };
  }

  async unpublish(user: AuthUser, scenarioId: string) {
    const r = await this.db.query("UPDATE scenarios SET visibility = 'private', publication_status = 'none', published_at = NULL WHERE id = $1 AND owner_id = $2 RETURNING id", [scenarioId, user.id]);
    if (!r.length) throw new NotFoundException("Scénario introuvable.");
    await this.db.query("DELETE FROM scenario_favorites WHERE scenario_key = $1", [`user:${scenarioId}`]);
    return { status: "none" };
  }

  async report(user: AuthUser, key: string, reason: string) {
    if (!key.startsWith("user:")) throw new BadRequestException("Seuls les scénarios communautaires peuvent être signalés.");
    this.reportLimiter.check(user.id);
    const id = key.slice(5);
    if (!(await this.db.one("SELECT id FROM scenarios WHERE id = $1 AND visibility = 'public'", [id]))) throw new NotFoundException();
    this.reportLimiter.fail(user.id);
    await this.db.query("INSERT INTO content_reports(id, reporter_id, scenario_id, reason) VALUES ($1,$2,$3,$4)", [randomUUID(), user.id, id, reason.trim().slice(0, 600)]);
    return { reported: true };
  }

  // ---- modération (administrateur)
  pending() {
    return this.db.query(`SELECT s.id, s.title, s.mode, s.summary, s.prompt, s.publication, s.publication_status, s.created_at, u.display_name AS author FROM scenarios s JOIN users u ON u.id = s.owner_id WHERE s.publication_status = 'pending' ORDER BY s.created_at`);
  }
  async decide(id: string, approve: boolean, reason?: string) {
    const r = await this.db.query("UPDATE scenarios SET publication_status = $1, visibility = $2, published_at = $3, rejection_reason = $4 WHERE id = $5 AND publication_status IN ('pending','published') RETURNING id",
      [approve ? "published" : "rejected", approve ? "public" : "private", approve ? new Date().toISOString() : null, approve ? null : (reason ?? "Non conforme aux règles de publication.").slice(0, 300), id]);
    if (!r.length) throw new NotFoundException("Aucune demande de publication correspondante.");
    if (!approve) await this.db.query("DELETE FROM scenario_favorites WHERE scenario_key = $1", [`user:${id}`]);
    return { ok: true };
  }
  reports() {
    return this.db.query("SELECT r.id, r.reason, r.status, r.created_at, r.scenario_id, s.title, u.display_name AS reporter FROM content_reports r JOIN scenarios s ON s.id = r.scenario_id LEFT JOIN users u ON u.id = r.reporter_id WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 100");
  }
  async closeReport(id: string) {
    await this.db.query("UPDATE content_reports SET status = 'closed' WHERE id = $1", [id]);
    return { ok: true };
  }
}

@Controller("library")
export class LibraryController {
  constructor(private readonly svc: LibraryService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  list(@CurrentUser() user?: AuthUser) {
    return this.svc.list(user);
  }

  @Get("item")
  @UseGuards(OptionalAuthGuard)
  item(@Query("key") key: string, @CurrentUser() user?: AuthUser) {
    return this.svc.find(String(key ?? ""), user);
  }

  @Post("favorite")
  @UseGuards(AuthGuard)
  favorite(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { key, on } = parse(z.object({ key: z.string().min(2).max(80), on: z.boolean() }), body);
    return this.svc.setFavorite(user, key, on);
  }

  @Post("fork/:id")
  @UseGuards(AuthGuard)
  fork(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.fork(user, id);
  }

  @Post("report")
  @UseGuards(AuthGuard)
  report(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { key, reason } = parse(z.object({ key: z.string().min(2).max(80), reason: z.string().trim().min(5).max(600) }), body);
    return this.svc.report(user, key, reason);
  }
}

@Controller("publications")
@UseGuards(AuthGuard)
export class PublicationController {
  constructor(private readonly svc: LibraryService) {}

  @Post(":id")
  publish(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.publish(user, id, body);
  }

  @Delete(":id")
  unpublish(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.svc.unpublish(user, id);
  }
}

@Controller("admin/moderation")
@UseGuards(AuthGuard, OwnerGuard)
export class ModerationController {
  constructor(private readonly svc: LibraryService) {}

  @Get("pending")
  pending() {
    return this.svc.pending();
  }

  @Post("pending/:id")
  decide(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { approve, reason } = parse(z.object({ approve: z.boolean(), reason: z.string().max(300).optional() }), body);
    return this.svc.decide(id, approve, reason);
  }

  @Get("reports")
  reports() {
    return this.svc.reports();
  }

  @Post("reports/:id/close")
  close(@Param("id", ParseUUIDPipe) id: string) {
    return this.svc.closeReport(id);
  }
}
