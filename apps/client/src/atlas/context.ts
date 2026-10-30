import { campColor, mapStyleFor, MapStyle } from "./styles";
import { Provenance, provenanceOf } from "./provenance";

/**
 * Contexte stratégique d'une simulation : la représentation structurée dont l'atlas a besoin (identité, géographie, acteurs,
 * zones, événements, relations). Il est dérivé uniquement de la vue que le serveur envoie au participant : ni valeur
 * inventée, ni information qu'il n'a pas le droit de connaître. Une donnée absente reste absente (null, tableau vide).
 */
export interface AtlasPoint { name?: string; lat: number | null; lon: number | null; x: number | null; y: number | null }
export interface AtlasActor {
  id: string; name: string; short: string; kind: string; camp: string; campLabel: string; iso: string[]; leader: string | null; leaderStatus: Provenance;
  description: string; npc: boolean; isMe: boolean; points: AtlasPoint[]; raw: any;
}
export interface AtlasZone { id: string; name: string; domain: string; tension: number; point: AtlasPoint; control: Record<string, number> | null }
export interface AtlasEvent { id: string; round: number; kind: string; title: string; text: string; point: AtlasPoint; actors: string[] }
export interface AtlasLink { a: string; b: string; kind: "war" | "alliance" | "escalation" | "tension"; label: string; weight: number }
export type LayerKey = "borders" | "actors" | "tension" | "control" | "relations" | "events" | "graticule";
export interface LayerDef { key: LayerKey; label: string; hint: string; on: boolean }

export interface AtlasContext {
  level: "public" | "team" | "president";
  identity: { title: string; topic: string; startLabel: string; startDate: string | null; era: string; eraLabel: string; mode: string; knowledgeCutoff: string | null; tempo: string };
  geography: {
    name: string; basemap: "borders" | "land" | "schematic"; note: string | null; focusIso: string[]; center: [number, number] | null; maritime: boolean;
    fictionalRegions: { id: string; name: string; x: number; y: number; owner?: string }[]; style: MapStyle;
  };
  actors: AtlasActor[];
  zones: AtlasZone[];
  events: AtlasEvent[];
  links: AtlasLink[];
  camps: { id: string; label: string; color: string }[];
  round: number; roundsPlanned: number; simTime: string;
  /** Nombre de rounds déjà résolus par le moteur : avant le premier, les valeurs sont celles de départ du scénario. */
  resolved: number;
  me: AtlasActor | null;
  layers: LayerDef[];
}

const pt = (r: any): AtlasPoint => ({ name: r?.name, lat: r?.lat ?? null, lon: r?.lon ?? null, x: r?.x ?? null, y: r?.y ?? null });
const hasXY = (p: AtlasPoint, fictional: boolean) => (fictional ? p.x != null && p.y != null : p.lat != null && p.lon != null);

export function buildAtlasContext(view: any): AtlasContext | null {
  const s = view?.setting;
  if (!s?.theatre) return null;
  const th = s.theatre;
  const fictional = th.basemap === "schematic" || th.map_kind === "fictional";
  const basemap: "borders" | "land" | "schematic" = th.basemap ?? (fictional ? "schematic" : "borders");
  const style = mapStyleFor(th.atlas_style, s.era);
  const light = style.light;
  const meId = view.me?.id;

  const actors: AtlasActor[] = (view.actors ?? []).map((a: any) => ({
    id: a.id, name: a.name, short: a.short ?? a.id, kind: a.kind, camp: a.camp, campLabel: a.camp_label ?? a.camp, iso: a.iso_n3 ?? [], leader: a.leader ?? null,
    leaderStatus: provenanceOf(a.leader_status), description: a.description ?? "", npc: a.controlled_by === "npc", isMe: a.id === meId,
    points: (a.regions ?? []).map(pt).filter((p: AtlasPoint) => hasXY(p, fictional)), raw: a,
  }));
  const byId = new Map(actors.map((a) => [a.id, a]));

  const control: Record<string, Record<string, number>> | undefined = view.zones_control;
  const zones: AtlasZone[] = (view.zones ?? []).map((z: any) => ({
    id: z.id, name: z.name, domain: z.domain, tension: z.tension ?? 0, point: pt(z.region), control: control?.[z.id] ?? null,
  })).filter((z: AtlasZone) => hasXY(z.point, fictional));

  const lastRound = view.round ?? 0;
  const events: AtlasEvent[] = (view.events ?? [])
    .filter((e: any) => e.location && hasXY(pt(e.location), fictional))
    .map((e: any) => ({ id: e.id, round: e.round, kind: e.kind, title: e.title, text: e.text, point: pt(e.location), actors: e.actors ?? [] }))
    .filter((e: AtlasEvent) => e.round >= lastRound - 2);

  const links: AtlasLink[] = [];
  const seen = new Set<string>();
  const key = (a: string, b: string) => [a, b].sort().join("|");
  const push = (l: AtlasLink) => {
    if (byId.has(l.a) && byId.has(l.b) && !seen.has(key(l.a, l.b) + l.kind)) { seen.add(key(l.a, l.b) + l.kind); links.push(l); }
  };
  for (const [a, b] of view.wars ?? []) push({ a, b, kind: "war", label: "En guerre", weight: 3 });
  for (const e of view.escalation ?? []) push({ a: e.a, b: e.b, kind: "escalation", label: e.label, weight: 1 + (e.rung ?? 4) / 4 });
  for (const r of view.me?.relations ?? []) {
    if (r.alliance) push({ a: meId, b: r.with, kind: "alliance", label: "Alliance", weight: 2 });
    else if (r.tension >= 60 && !r.at_war) push({ a: meId, b: r.with, kind: "tension", label: `Tension ${r.tension}/100`, weight: 1 });
  }

  const camps = Object.keys(s.camps ?? {}).map((id) => ({ id, label: s.camps[id], color: campColor(id, light) }));

  const geo = {
    name: th.name, basemap, note: th.map_note ?? (basemap === "borders" ? th.border_warning ?? null : null), focusIso: th.iso_n3 ?? [],
    center: (th.center as [number, number] | null) ?? null, maritime: !!th.maritime, fictionalRegions: th.fictional_regions ?? [], style,
  };
  const hasPoints = actors.some((a) => a.points.length) || (fictional && geo.fictionalRegions.length > 0);
  const layers: LayerDef[] = [];
  if (basemap === "borders") layers.push({ key: "borders", label: "Frontières", hint: "Frontières actuelles (Natural Earth)", on: true });
  if (hasPoints) layers.push({ key: "actors", label: "Acteurs", hint: "Positions des acteurs", on: true });
  if (zones.length) layers.push({ key: "tension", label: "Tensions", hint: "Zones de crise, colorées selon leur niveau de tension", on: true });
  if (zones.some((z) => z.control)) layers.push({ key: "control", label: "Contrôle", hint: "Part de contrôle de chaque acteur sur les zones", on: false });
  if (links.length) layers.push({ key: "relations", label: "Relations", hint: "Guerres, escalades et alliances connues de vous", on: true });
  if (events.length) layers.push({ key: "events", label: "Événements", hint: "Événements localisés des deux derniers rounds", on: true });
  if (!fictional) layers.push({ key: "graticule", label: "Méridiens", hint: "Méridiens et parallèles", on: true });

  return {
    level: view.level ?? "public",
    identity: {
      title: s.title, topic: s.topic, startLabel: s.start_label, startDate: s.start_date ?? null, era: s.era, eraLabel: s.era_label ?? th.era_label ?? s.era,
      mode: s.mode, knowledgeCutoff: s.knowledge_cutoff ?? null, tempo: s.tempo ?? "mixed",
    },
    geography: geo, actors, zones, events, links, camps,
    round: lastRound, roundsPlanned: view.rounds_planned ?? 0, simTime: view.sim_time ?? "", resolved: (view.rounds ?? []).length,
    me: byId.get(meId) ?? null, layers,
  };
}

// ---------------------------------------------------------------- synthèse (Strategic Intelligence)

export interface Development { id: string; round: number; title: string; text: string; scope: "public" | "private" | "communique" }
export interface TensionItem { label: string; value: number; tone: "red" | "amber" | "steel"; sub?: string }
export interface Perspective { label: string; text: string; progress: number | null; tone: "brass" | "red" | "steel" }

export interface Intelligence {
  situation: { title: string; text: string; kicker: string };
  developments: Development[];
  tensions: TensionItem[];
  perspectives: Perspective[];
  perspectivesTitle: string;
}

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

/** Situation générale, développements, tensions et perspectives : tout est repris de l'état réel de la partie. */
export function buildIntelligence(ctx: AtlasContext, view: any): Intelligence {
  const rounds: any[] = view?.rounds ?? [];
  const last = rounds[rounds.length - 1];
  const notes: string = view?.setting?.notes ?? "";
  const situation = last
    ? { kicker: `Round ${last.round}${last.sim_time ? ` · ${last.sim_time}` : ""}`, title: last.title, text: last.narrative }
    : { kicker: ctx.identity.startLabel, title: ctx.geography.name, text: notes || ctx.identity.topic };

  const developments: Development[] = [
    ...(view?.communiques ?? []).map((c: any) => ({ id: c.id, round: c.round, title: c.title, text: c.general_impact || c.body, scope: "communique" as const })),
    ...(view?.private_events ?? []).map((e: any) => ({ id: e.id, round: e.round, title: e.title, text: e.text, scope: "private" as const })),
    ...(view?.events ?? []).map((e: any) => ({ id: e.id, round: e.round, title: e.title, text: e.text, scope: "public" as const })),
  ].sort((a, b) => b.round - a.round).slice(0, 8).map((d) => ({ ...d, text: clip(d.text ?? "", 220) }));

  const name = (id: string) => ctx.actors.find((a) => a.id === id)?.name ?? id;
  const tensions: TensionItem[] = [];
  for (const z of [...ctx.zones].sort((a, b) => b.tension - a.tension).slice(0, 4)) {
    tensions.push({ label: z.name, value: z.tension, tone: z.tension >= 60 ? "red" : z.tension >= 35 ? "amber" : "steel", sub: "zone de crise" });
  }
  for (const l of ctx.links.filter((l) => l.kind === "war" || l.kind === "escalation").slice(0, 4)) {
    tensions.push({ label: `${name(l.a)} — ${name(l.b)}`, value: l.kind === "war" ? 100 : Math.round(l.weight * 25), tone: l.kind === "war" ? "red" : "amber", sub: l.label });
  }

  let perspectives: Perspective[] = [];
  let perspectivesTitle = "Perspectives stratégiques";
  if (view?.me?.objectives?.length) {
    perspectivesTitle = `Objectifs de ${view.me.short ?? view.me.name}`;
    perspectives = view.me.objectives.map((o: any) => ({
      label: o.kind === "primary" ? "Objectif principal" : o.kind === "secret" ? "Objectif confidentiel" : o.kind === "coalition" ? "Objectif de coalition" : "Objectif secondaire",
      text: o.text, progress: o.progress ?? null, tone: o.kind === "primary" ? "brass" : o.kind === "secret" ? "red" : "steel",
    }));
  } else if (view?.dominant?.length) {
    perspectivesTitle = "Rapport de force réel";
    perspectives = view.dominant.map((r: any) => ({ label: `${r.name}`, text: `Indice de puissance ${r.index}/100`, progress: r.index / 100, tone: "brass" as const }));
  } else if (view?.balance?.ranking?.length) {
    perspectivesTitle = "Rapport de force connu";
    perspectives = view.balance.ranking.slice(0, 3).map((r: any) => ({ label: r.name, text: `Indice de puissance ${r.index}/100`, progress: r.index / 100, tone: "brass" as const }));
  }
  return { situation, developments, tensions, perspectives, perspectivesTitle };
}

// ---------------------------------------------------------------- indicateurs clés

export interface KeyIndicator { key: string; label: string; value: string; sub: string; delta: number | null; status: Provenance }

/** Quelques mesures réellement utiles, uniquement quand le participant en dispose (jamais de valeur par défaut). */
export function keyIndicators(ctx: AtlasContext, view: any, previous?: Record<string, number>): KeyIndicator[] {
  const me = view?.me;
  const out: KeyIndicator[] = [];
  const d = (k: string, v: number) => (previous && k in previous ? Math.round(v - previous[k]) : null);
  if (me) {
    const st: Provenance = ctx.resolved > 0 ? "simulation" : provenanceOf(me.indicators_source?.status);
    out.push({ key: "economy", label: "Économie", value: `${Math.round(me.capitals.economic)}`, sub: "capital économique /100", delta: d("economic", me.capitals.economic), status: st });
    out.push({ key: "military", label: "Militaire", value: `${Math.round(me.capitals.military)}`, sub: `capital militaire · disponibilité ${Math.round(me.readiness)} %`, delta: d("military", me.capitals.military), status: st });
    const rel: any[] = me.relations ?? [];
    out.push({
      key: "diplomacy", label: "Diplomatie", value: `${Math.round(me.capitals.political)}`,
      sub: `capital politique · ${rel.filter((r) => r.alliance).length} alliance(s) · ${rel.filter((r) => r.at_war).length} guerre(s)`, delta: d("political", me.capitals.political), status: st,
    });
  }
  if (ctx.zones.length) {
    const avg = ctx.zones.reduce((s, z) => s + z.tension, 0) / ctx.zones.length;
    out.push({ key: "territories", label: "Territoires", value: `${ctx.zones.length}`, sub: `zone(s) de crise · tension moyenne ${Math.round(avg)}/100`, delta: d("tension", avg), status: ctx.resolved > 0 ? "simulation" : "hypothesis" });
  }
  return out;
}

/** Valeurs suivies d'un round à l'autre pour afficher l'évolution (▲ ▼) : uniquement ce que la vue contient. */
export function snapshotNumbers(ctx: AtlasContext, view: any): Record<string, number> {
  const out: Record<string, number> = {};
  const me = view?.me;
  if (me) {
    out.political = me.capitals.political; out.economic = me.capitals.economic; out.military = me.capitals.military;
    out.stability = me.stability; out.cohesion = me.cohesion; out.approval = me.approval; out.readiness = me.readiness; out.weariness = me.weariness;
  }
  if (ctx.zones.length) out.tension = ctx.zones.reduce((s, z) => s + z.tension, 0) / ctx.zones.length;
  return out;
}
