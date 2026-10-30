import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { geoCentroid, geoDistance, geoGraticule, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { Flag } from "../components/Flag";
import { mainland, useTopo } from "../components/GeoMap";
import { C, F } from "../theme";
import { AtlasActor, AtlasContext, AtlasEvent, AtlasPoint, AtlasZone, LayerKey } from "./context";
import { ProvenanceChip } from "./parts";

export type MapSelection = { type: "actor" | "zone" | "event"; id: string } | null;
/** Demande de sélection venue de l'extérieur (ex. « voir sur la carte » depuis la synthèse). `n` change à chaque demande. */
export interface MapFocus { type: "actor" | "zone" | "event"; id: string; n: number }

const norm = (id: unknown) => String(id).padStart(3, "0");
const DOMAINS: Record<string, string> = { military: "Militaire", diplomatic: "Diplomatique", economic: "Économique", political: "Politique", maritime: "Maritime", information: "Information", humanitarian: "Humanitaire" };
const arc = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) => {
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1},${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
};
const niceStep = (span: number, target: number) => {
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
};

interface Marker { key: string; kind: "actor" | "zone" | "event"; id: string; x: number; y: number; label: string; prio: number; color: string; actor?: AtlasActor; zone?: AtlasZone; event?: AtlasEvent }

/**
 * Carte stratégique interactive : zoom, déplacement, couches contextuelles, sélection d'un repère.
 * Le fond respecte l'époque (frontières actuelles, côtes seules ou schéma) ; rien n'est dessiné qui ne vienne de la partie.
 */
export function StrategicMap({ ctx, width, height, compact = false, onSelect, focus }: { ctx: AtlasContext; width: number; height: number; compact?: boolean; onSelect?: (s: MapSelection) => void; focus?: MapFocus | null }) {
  const st = ctx.geography.style;
  const fictional = ctx.geography.basemap === "schematic";
  const topo = useTopo("countries-50m");
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<MapSelection>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  // Cadrage : « théâtre » (pays concernés et zones de crise) ou « ensemble » (tous les acteurs, y compris les lointains).
  const [framing, setFraming] = useState<"theatre" | "all">("theatre");
  const hasTheatre = ctx.geography.focusIso.length > 0 || ctx.zones.length > 0;
  const farActors = ctx.actors.some((a) => a.points.length > 0);
  const frameAll = framing === "all" || !hasTheatre;
  const layerOn = (key: LayerKey) => off[key] === undefined ? (ctx.layers.find((l) => l.key === key)?.on ?? false) : !off[key];
  const has = (key: LayerKey) => ctx.layers.some((l) => l.key === key);
  const pad = compact ? 14 : 34;

  // ---- projection : s'ajuste aux pays du théâtre et aux repères de la partie
  const geo = useMemo(() => {
    if (fictional || !topo) return null;
    const countries: any[] = (feature(topo, topo.objects.countries) as any).features;
    const focusSet = new Set(ctx.geography.focusIso.map(norm));
    // Fond « côtes seules » (époques anciennes) : les pays actuels n'ont aucune valeur pour cadrer la scène, on s'ajuste aux repères du scénario.
    const focus = ctx.geography.basemap === "land" && ctx.zones.length ? [] : countries.filter((f) => focusSet.has(norm(f.id))).map(mainland);
    const coords: [number, number][] = [];
    const add = (p: AtlasPoint) => { if (p.lon != null && p.lat != null) coords.push([p.lon, p.lat]); };
    if (frameAll) ctx.actors.forEach((a) => a.points.forEach(add));
    ctx.zones.forEach((z) => add(z.point));
    const fit: any = { type: "FeatureCollection", features: [...focus] };
    if (coords.length) fit.features.push({ type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: coords } });
    let projection = geoMercator();
    if (fit.features.length) {
      projection.fitExtent([[pad, pad], [width - pad, height - pad]], fit);
      const maxScale = (width / (14 * Math.PI / 180)); // jamais plus près qu'environ 14° de large
      if (projection.scale() > maxScale) projection.center(geoCentroid(fit)).scale(maxScale).translate([width / 2, height / 2]);
    } else if (ctx.geography.center) {
      projection.center(ctx.geography.center).scale(width * 0.9).translate([width / 2, height / 2]);
    } else {
      projection = geoMercator().scale(width / 6.4).translate([width / 2, height / 1.7]);
    }
    const path = geoPath(projection);
    const inView = (f: any) => { const [[x0, y0], [x1, y1]] = path.bounds(f); return x1 > -width && x0 < 2 * width && y1 > -height && y0 < 2 * height; };
    const borders = countries.filter(inView).map((f) => ({ id: norm(f.id), d: path(f) ?? "", own: focusSet.has(norm(f.id)) })).filter((c) => c.d);
    const land = ctx.geography.basemap === "land" && topo.objects.land ? path((feature(topo, topo.objects.land) as any)) : null;
    return { projection, path, borders, land, graticule: path(geoGraticule().step([5, 5])()) ?? "" };
  }, [topo, fictional, ctx.geography.basemap, ctx.geography.focusIso.join(), ctx.actors, ctx.zones, width, height, pad, frameAll]);

  const xy = useCallback((p: AtlasPoint): [number, number] | null => {
    if (fictional) return p.x == null || p.y == null ? null : [30 + (p.x / 100) * (width - 60), 30 + (p.y / 100) * (height - 60)];
    if (!geo || p.lon == null || p.lat == null) return null;
    return geo.projection([p.lon, p.lat]) as [number, number] | null;
  }, [fictional, geo, width, height]);

  // ---- repères
  const markers = useMemo(() => {
    const out: Marker[] = [];
    if (layerOn("actors")) {
      if (fictional) {
        ctx.geography.fictionalRegions.forEach((r) => {
          const p = xy({ lat: null, lon: null, x: r.x, y: r.y });
          const mine = ctx.me && (r.owner === ctx.me.id || r.id === ctx.me.id);
          if (p) out.push({ key: `r${r.id}`, kind: "actor", id: r.owner ?? r.id, x: p[0], y: p[1], label: r.name, prio: mine ? 9 : 4, color: mine ? C.brass : st.accent, actor: ctx.actors.find((a) => a.id === (r.owner ?? r.id)) });
        });
      } else {
        for (const a of ctx.actors) {
          const p = a.points[0] && xy(a.points[0]);
          if (p) out.push({ key: `a${a.id}`, kind: "actor", id: a.id, x: p[0], y: p[1], label: a.short || a.name, prio: a.isMe ? 10 : a.npc ? 3 : 7, color: ctx.camps.find((c) => c.id === a.camp)?.color ?? st.accent, actor: a });
        }
      }
    }
    if (layerOn("tension") || layerOn("control")) {
      for (const z of ctx.zones) {
        const p = xy(z.point);
        if (p) out.push({ key: `z${z.id}`, kind: "zone", id: z.id, x: p[0], y: p[1], label: z.name, prio: 5 + z.tension / 25, color: z.tension >= 60 ? st.tension : z.tension >= 35 ? (st.light ? "#A8741A" : C.amber) : st.accent, zone: z });
      }
    }
    if (layerOn("events")) {
      for (const e of ctx.events) {
        const p = xy(e.point);
        if (p) out.push({ key: `e${e.id}`, kind: "event", id: e.id, x: p[0], y: p[1], label: e.title, prio: 2 + e.round / 20, color: st.light ? "#A8741A" : C.amber, event: e });
      }
    }
    return out;
  }, [ctx, xy, off, fictional]);

  const links = useMemo(() => {
    if (!layerOn("relations")) return [];
    return ctx.links.map((l) => {
      const a = ctx.actors.find((x) => x.id === l.a), b = ctx.actors.find((x) => x.id === l.b);
      const pa = a && (fictional ? null : a.points[0] && xy(a.points[0])), pb = b && (fictional ? null : b.points[0] && xy(b.points[0]));
      const ra = fictional ? ctx.geography.fictionalRegions.find((r) => (r.owner ?? r.id) === l.a) : null, rb = fictional ? ctx.geography.fictionalRegions.find((r) => (r.owner ?? r.id) === l.b) : null;
      const A = pa ?? (ra ? xy({ lat: null, lon: null, x: ra.x, y: ra.y }) : null), B = pb ?? (rb ? xy({ lat: null, lon: null, x: rb.x, y: rb.y }) : null);
      return A && B ? { ...l, A, B } : null;
    }).filter(Boolean) as (typeof ctx.links[number] & { A: [number, number]; B: [number, number] })[];
  }, [ctx, xy, off, fictional]);

  // ---- gestes : déplacement (glisser), zoom (molette sur le web, boutons partout)
  const clamp = (v: { k: number; x: number; y: number }) => {
    const k = Math.min(10, Math.max(1, v.k));
    const mx = (width * (k - 1)) / 1 + width * 0.35, my = (height * (k - 1)) / 1 + height * 0.35;
    return { k, x: Math.min(width * 0.35, Math.max(-mx, v.x)), y: Math.min(height * 0.35, Math.max(-my, v.y)) };
  };
  const zoomAt = (factor: number, cx = width / 2, cy = height / 2) => {
    const v = viewRef.current;
    const k = Math.min(10, Math.max(1, v.k * factor));
    const f = k / v.k;
    setView(clamp({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }));
  };
  const start = useRef({ x: 0, y: 0 });
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 5,
    onPanResponderGrant: () => { start.current = { x: viewRef.current.x, y: viewRef.current.y }; },
    onPanResponderMove: (_, g) => setView(clamp({ k: viewRef.current.k, x: start.current.x + g.dx, y: start.current.y + g.dy })),
  })).current;
  const box = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el: HTMLElement | null = box.current;
    if (!el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // la molette seule fait défiler la page ; Ctrl/⌘ + molette zoome la carte
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [width, height]);
  useEffect(() => { setView({ k: 1, x: 0, y: 0 }); setSelected(null); }, [ctx.geography.name]);
  useEffect(() => { if (focus) setSelected({ type: focus.type, id: focus.id }); }, [focus?.n]);
  useEffect(() => { setView({ k: 1, x: 0, y: 0 }); }, [frameAll]);

  const select = (s: MapSelection) => { setSelected(s); onSelect?.(s); };

  // ---- étiquettes sans chevauchement (par priorité), calculées à l'échelle de l'écran
  const labels = useMemo(() => {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const size = compact ? 9.5 : 10.5;
    const out = new Set<string>();
    for (const m of [...markers].sort((a, b) => b.prio - a.prio)) {
      const w = Math.min(m.label.length, 26) * size * 0.58 + 10;
      const sx = m.x * view.k + view.x, sy = m.y * view.k + view.y;
      const r = { x0: sx + 8, y0: sy - size, x1: sx + 8 + w, y1: sy + 4 };
      const forced = hover === m.key || (selected && selected.id === m.id && selected.type === m.kind);
      if (forced || !placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) { placed.push(r); out.add(m.key); }
    }
    return out;
  }, [markers, view, hover, selected, compact]);

  if (!fictional && !geo) {
    return (
      <View style={{ width, height, backgroundColor: st.paper, alignItems: "center", justifyContent: "center" }} accessibilityLabel="Chargement de la carte">
        <Text style={{ color: st.inkSoft, fontFamily: F.mono, fontSize: 11 }}>Chargement du fond de carte…</Text>
      </View>
    );
  }

  const k = view.k;
  const sw = (n: number) => n / k;
  const inkLabel = (m: Marker) => {
    const [lx, ly] = [m.x + 8 / k, m.y + 3 / k];
    const fs = (compact ? 9.5 : 10.5) / k;
    return (
      <G key={`l${m.key}`} pointerEvents="none">
        <SvgText x={lx} y={ly} fontSize={fs} fontFamily={F.sansMed} fill={st.halo} stroke={st.halo} strokeWidth={3.2 / k} strokeLinejoin="round" opacity={0.92}>{m.label.length > 26 ? m.label.slice(0, 25) + "…" : m.label}</SvgText>
        <SvgText x={lx} y={ly} fontSize={fs} fontFamily={F.sansMed} fill={st.ink}>{m.label.length > 26 ? m.label.slice(0, 25) + "…" : m.label}</SvgText>
      </G>
    );
  };

  // ---- repères de cadre (méridiens/parallèles, échelle) : recalculés pour la vue courante
  let ticks: { x?: number; y?: number; t: string }[] = [];
  let scale: { px: number; km: number } | null = null;
  if (geo && !compact) {
    const proj = geo.projection;
    const tl = proj.invert!([(0 - view.x) / k, (0 - view.y) / k]), br = proj.invert!([(width - view.x) / k, (height - view.y) / k]);
    if (tl && br) {
      const stepLat = niceStep(Math.abs(tl[1] - br[1]), 4), stepLon = niceStep(Math.abs(br[0] - tl[0]), 5);
      for (let lat = Math.ceil(br[1] / stepLat) * stepLat; lat <= tl[1]; lat += stepLat) {
        const p = proj([tl[0], lat]); if (p) ticks.push({ y: p[1] * k + view.y, t: `${Math.abs(Math.round(lat * 10) / 10)}°${lat >= 0 ? "N" : "S"}` });
      }
      for (let lon = Math.ceil(tl[0] / stepLon) * stepLon; lon <= br[0]; lon += stepLon) {
        const p = proj([lon, tl[1]]); if (p) ticks.push({ x: p[0] * k + view.x, t: `${Math.abs(Math.round(lon * 10) / 10)}°${lon >= 0 ? "E" : "O"}` });
      }
      const mid = [width / 2, height / 2], a = proj.invert!([(mid[0] - view.x) / k, (mid[1] - view.y) / k]), b = proj.invert!([(mid[0] + 90 - view.x) / k, (mid[1] - view.y) / k]);
      if (a && b) {
        const km = geoDistance(a, b) * 6371, nice = niceStep(km, 1);
        scale = { km: nice, px: (nice / km) * 90 };
      }
    }
  }

  const sel = selected;
  const selMarker = sel ? markers.find((m) => m.kind === sel.type && m.id === sel.id) : null;
  const chip = (key: LayerKey, label: string, hint: string) => {
    const on = layerOn(key);
    return (
      <Pressable key={key} accessibilityRole="switch" accessibilityLabel={`Couche ${label}`} accessibilityHint={hint} accessibilityState={{ checked: on }}
        onPress={() => setOff((o) => ({ ...o, [key]: on }))}
        style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: on ? st.ink : st.grid, backgroundColor: on ? (st.light ? "#2B2418D8" : "#F3F0E91F") : (st.light ? "#F0E7CFCC" : "#0B1420CC") }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.4, color: on ? (st.light ? "#F3EEDD" : C.text) : st.inkSoft, textTransform: "uppercase" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View ref={box} style={{ width, height, backgroundColor: st.paper, overflow: "hidden" }} {...responder.panHandlers}
      accessibilityLabel={`Carte stratégique : ${ctx.geography.name}. ${ctx.actors.length} acteurs, ${ctx.zones.length} zones. Le détail est aussi disponible dans la synthèse.`}>
      <Svg width={width} height={height}>
        <Rect width={width} height={height} fill={st.sea} />
        <G transform={`translate(${view.x} ${view.y}) scale(${k})`}>
          {geo && layerOn("graticule") ? <Path d={geo.graticule} stroke={st.grid} strokeWidth={sw(0.6)} fill="none" opacity={0.85} /> : null}
          {geo?.land ? <Path d={geo.land} fill={st.land} stroke={st.coast} strokeWidth={sw(1)} strokeLinejoin="round" /> : null}
          {geo && ctx.geography.basemap === "borders" ? geo.borders.map((c) => {
            const bordersOn = layerOn("borders");
            return (
              <Path key={c.id} d={c.d} fill={c.own ? st.landHi : st.land} stroke={bordersOn ? (c.own ? st.coast : st.border) : st.coast} strokeWidth={sw(c.own ? 1.1 : bordersOn ? 0.6 : 0.5)} strokeLinejoin="round" />
            );
          }) : null}
          {fictional ? (
            <>
              {Array.from({ length: 9 }).map((_, i) => <Line key={`h${i}`} x1={0} x2={width} y1={(i * height) / 8} y2={(i * height) / 8} stroke={st.grid} strokeWidth={sw(0.6)} opacity={0.8} />)}
              {Array.from({ length: 13 }).map((_, i) => <Line key={`v${i}`} y1={0} y2={height} x1={(i * width) / 12} x2={(i * width) / 12} stroke={st.grid} strokeWidth={sw(0.6)} opacity={0.6} />)}
            </>
          ) : null}

          {links.map((l, i) => {
            const mx = (l.A[0] + l.B[0]) / 2, my = (l.A[1] + l.B[1]) / 2, dx = l.B[0] - l.A[0], dy = l.B[1] - l.A[1], bend = 0.16;
            const color = l.kind === "war" ? st.tension : l.kind === "alliance" ? (st.light ? "#8F7440" : C.brass) : l.kind === "escalation" ? (st.light ? "#A8741A" : C.amber) : st.inkSoft;
            return <Path key={`k${i}`} d={`M${l.A[0]},${l.A[1]} Q${mx - dy * bend},${my + dx * bend} ${l.B[0]},${l.B[1]}`} fill="none" stroke={color} strokeWidth={sw(1 + l.weight * 0.55)}
              strokeDasharray={l.kind === "alliance" ? `${6 / k},${4 / k}` : l.kind === "tension" ? `${2 / k},${4 / k}` : undefined} opacity={0.85} />;
          })}

          {markers.filter((m) => m.kind === "zone").map((m) => {
            const z = m.zone!, r = (12 + z.tension * 0.16) / k;
            const ctl = layerOn("control") && z.control ? Object.entries(z.control).filter(([, v]) => v > 0.001) : null;
            return (
              <G key={m.key}>
                {ctl && ctl.length ? (() => {
                  const total = ctl.reduce((s, [, v]) => s + v, 0) || 1; let a0 = -Math.PI / 2;
                  return ctl.map(([id, v]) => {
                    const a1 = a0 + (v / total) * Math.PI * 2 * 0.9999; const d = arc(m.x, m.y, r * 0.62, r * 1.05, a0, a1); a0 += (v / total) * Math.PI * 2;
                    const actor = ctx.actors.find((a) => a.id === id);
                    return <Path key={id} d={d} fill={ctx.camps.find((c) => c.id === actor?.camp)?.color ?? st.accent} opacity={0.9} />;
                  });
                })() : layerOn("tension") ? <Circle cx={m.x} cy={m.y} r={r} fill={m.color} opacity={0.2} stroke={m.color} strokeWidth={sw(1.2)} /> : null}
                <Polygon points={`${m.x},${m.y - 5 / k} ${m.x + 5 / k},${m.y} ${m.x},${m.y + 5 / k} ${m.x - 5 / k},${m.y}`} fill={m.color} stroke={st.halo} strokeWidth={sw(1)} />
              </G>
            );
          })}
          {markers.filter((m) => m.kind === "event").map((m) => (
            <G key={m.key}><Circle cx={m.x} cy={m.y} r={9 / k} fill="none" stroke={m.color} strokeWidth={sw(1)} opacity={0.7} /><Circle cx={m.x} cy={m.y} r={3.6 / k} fill={m.color} stroke={st.halo} strokeWidth={sw(1)} /></G>
          ))}
          {markers.filter((m) => m.kind === "actor").map((m) => {
            const mine = m.actor?.isMe;
            return (
              <G key={m.key}>
                {mine ? <Circle cx={m.x} cy={m.y} r={11 / k} fill="none" stroke={m.color} strokeWidth={sw(1.4)} /> : null}
                <Circle cx={m.x} cy={m.y} r={(hover === m.key ? 6.5 : mine ? 5 : m.actor?.npc ? 3.4 : 4.2) / k} fill={m.color} stroke={st.halo} strokeWidth={sw(1.2)} />
              </G>
            );
          })}
          {sel && selMarker ? <Circle cx={selMarker.x} cy={selMarker.y} r={15 / k} fill="none" stroke={st.ink} strokeWidth={sw(1.4)} strokeDasharray={`${4 / k},${3 / k}`} /> : null}
          {markers.filter((m) => labels.has(m.key)).map(inkLabel)}
          {/* Zones de contact : cercles invisibles plus larges que les repères, utilisables au doigt comme à la souris. */}
          {markers.map((m) => (
            <Circle key={`h${m.key}`} cx={m.x} cy={m.y} r={Math.max(14, compact ? 12 : 16) / k} fill="transparent" onPress={() => select({ type: m.kind, id: m.id })}
              {...(Platform.OS === "web" ? ({ onMouseEnter: () => setHover(m.key), onMouseLeave: () => setHover((h) => (h === m.key ? null : h)) } as any) : {})} />
          ))}
        </G>
      </Svg>

      {/* Cadre d'atlas : double filet, graduations de latitude et de longitude, échelle. */}
      <Svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
        <Rect x={4.5} y={4.5} width={width - 9} height={height - 9} fill="none" stroke={st.ink} strokeWidth={1} opacity={0.55} />
        <Rect x={8.5} y={8.5} width={width - 17} height={height - 17} fill="none" stroke={st.ink} strokeWidth={0.5} opacity={0.35} />
        {ticks.map((t, i) => t.y != null && t.y > 24 && t.y < height - 24 ? (
          <G key={i}><Line x1={4} x2={11} y1={t.y} y2={t.y} stroke={st.ink} strokeWidth={1} opacity={0.7} />
            <SvgText x={13} y={t.y + 3} fontSize={8.5} fontFamily={F.mono} fill={st.inkSoft} stroke={st.paper} strokeWidth={2.4} strokeLinejoin="round" opacity={0.9}>{t.t}</SvgText>
            <SvgText x={13} y={t.y + 3} fontSize={8.5} fontFamily={F.mono} fill={st.inkSoft}>{t.t}</SvgText></G>
        ) : t.x != null && t.x > 40 && t.x < width - 40 ? (
          <G key={i}><Line x1={t.x} x2={t.x} y1={height - 11} y2={height - 4} stroke={st.ink} strokeWidth={1} opacity={0.7} />
            <SvgText x={t.x + 3} y={height - 14} fontSize={8.5} fontFamily={F.mono} fill={st.inkSoft} stroke={st.paper} strokeWidth={2.4} strokeLinejoin="round" opacity={0.9}>{t.t}</SvgText>
            <SvgText x={t.x + 3} y={height - 14} fontSize={8.5} fontFamily={F.mono} fill={st.inkSoft}>{t.t}</SvgText></G>
        ) : null)}
        {scale ? (
          <G>
            <Line x1={width - 24 - scale.px} x2={width - 24} y1={height - 30} y2={height - 30} stroke={st.ink} strokeWidth={2} />
            <Line x1={width - 24 - scale.px} x2={width - 24 - scale.px} y1={height - 34} y2={height - 26} stroke={st.ink} strokeWidth={1} />
            <Line x1={width - 24} x2={width - 24} y1={height - 34} y2={height - 26} stroke={st.ink} strokeWidth={1} />
            <SvgText x={width - 24 - scale.px / 2} y={height - 36} fontSize={9} fontFamily={F.mono} textAnchor="middle" fill={st.ink} stroke={st.paper} strokeWidth={2.4} strokeLinejoin="round">{scale.km} km</SvgText>
            <SvgText x={width - 24 - scale.px / 2} y={height - 36} fontSize={9} fontFamily={F.mono} textAnchor="middle" fill={st.ink}>{scale.km} km</SvgText>
          </G>
        ) : null}
      </Svg>

      {/* Couches et zoom */}
      {compact && width <= 420 ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: layersOpen }} accessibilityLabel="Couches de la carte" onPress={() => setLayersOpen(!layersOpen)}
          style={{ position: "absolute", left: 14, top: 14, paddingHorizontal: 10, height: 30, justifyContent: "center", borderWidth: 1, borderColor: st.ink, backgroundColor: st.light ? "#F0E7CFE6" : "#0B1420E6" }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1.4, color: st.ink, textTransform: "uppercase" }}>Couches {layersOpen ? "−" : "+"}</Text>
        </Pressable>
      ) : null}
      {!compact || width > 420 || layersOpen ? (
        <View style={{ position: "absolute", left: 14, top: compact && width <= 420 ? 50 : 14, right: 70, flexDirection: compact && width <= 420 ? "column" : "row", alignItems: "flex-start", flexWrap: "wrap", gap: 4 }}>
          {ctx.layers.map((l) => chip(l.key, l.label, l.hint))}
          {!fictional && hasTheatre && farActors ? (
            <Pressable accessibilityRole="button" accessibilityLabel={frameAll ? "Cadrer sur le théâtre de la crise" : "Cadrer sur tous les acteurs"} onPress={() => setFraming(frameAll ? "theatre" : "all")}
              style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: st.light ? "#8F7440" : C.brass, backgroundColor: st.light ? "#F0E7CFCC" : "#0B1420CC" }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.4, color: st.light ? "#6B5420" : C.brass, textTransform: "uppercase" }}>{frameAll ? "Vue : ensemble" : "Vue : théâtre"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ position: "absolute", right: 14, top: 14, gap: 4 }}>
        {[{ l: "+", a: "Zoom avant", f: () => zoomAt(1.5) }, { l: "−", a: "Zoom arrière", f: () => zoomAt(1 / 1.5) }, { l: "⟲", a: "Recentrer la carte", f: () => setView({ k: 1, x: 0, y: 0 }) }].map((b) => (
          <Pressable key={b.l} accessibilityRole="button" accessibilityLabel={b.a} onPress={b.f}
            style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: st.ink, backgroundColor: st.light ? "#F0E7CFE6" : "#0B1420E6" }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 15, color: st.ink }}>{b.l}</Text>
          </Pressable>
        ))}
      </View>

      {/* Note d'honnêteté du fond de carte */}
      {ctx.geography.note ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 14, bottom: 14, maxWidth: Math.max(160, width - 190), backgroundColor: st.light ? "#F0E7CFE0" : "#0B1420E0", paddingHorizontal: 8, paddingVertical: 4, borderLeftWidth: 2, borderLeftColor: st.tension }}>
          <Text numberOfLines={compact ? 2 : 3} style={{ fontFamily: F.sans, fontSize: 10.5, lineHeight: 14, color: st.ink }}>{ctx.geography.note}</Text>
        </View>
      ) : null}

      {sel ? <MapDetail ctx={ctx} sel={sel} onClose={() => select(null)} width={width} /> : null}
    </View>
  );
}

function MapDetail({ ctx, sel, onClose, width }: { ctx: AtlasContext; sel: NonNullable<MapSelection>; onClose: () => void; width: number }) {
  const st = ctx.geography.style;
  const bg = st.light ? "#FAF6E8F2" : "#10233DF2", ink = st.light ? st.ink : C.text, soft = st.light ? st.inkSoft : C.muted;
  let body: React.ReactNode = null;
  if (sel.type === "actor") {
    const a = ctx.actors.find((x) => x.id === sel.id);
    const reg = ctx.geography.fictionalRegions.find((r) => (r.owner ?? r.id) === sel.id || r.id === sel.id);
    if (a) {
      const camp = ctx.camps.find((c) => c.id === a.camp);
      body = (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Flag actor={a.raw} h={14} /><Text style={{ fontFamily: F.title, fontSize: 18, color: ink, flexShrink: 1 }}>{a.name}</Text></View>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.3, color: camp?.color ?? soft, textTransform: "uppercase" }}>{a.isMe ? "Votre acteur · " : a.npc ? "Acteur non joué · " : "Équipe humaine · "}{a.campLabel}</Text>
          {a.leader ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}><Text style={{ fontFamily: F.sans, fontSize: 12.5, color: ink }}>{a.leader}</Text><ProvenanceChip status={a.leaderStatus} compact light={st.light} /></View> : null}
          {a.description ? <Text numberOfLines={4} style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 17, color: soft }}>{a.description}</Text> : null}
        </>
      );
    } else if (reg) {
      body = <><Text style={{ fontFamily: F.title, fontSize: 18, color: ink }}>{reg.name}</Text><Text style={{ fontFamily: F.sans, fontSize: 12.5, color: soft }}>Région d'un monde inventé : position schématique.</Text></>;
    }
  } else if (sel.type === "zone") {
    const z = ctx.zones.find((x) => x.id === sel.id);
    if (z) {
      const tone = z.tension >= 60 ? st.tension : z.tension >= 35 ? (st.light ? "#A8741A" : C.amber) : st.accent;
      body = (
        <>
          <Text style={{ fontFamily: F.title, fontSize: 18, color: ink }}>{z.name}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.3, color: soft, textTransform: "uppercase" }}>Zone · {DOMAINS[z.domain] ?? z.domain}</Text>
          <View style={{ height: 5, backgroundColor: st.light ? "#00000014" : "#FFFFFF1A" }}><View style={{ height: 5, width: `${Math.min(100, z.tension)}%`, backgroundColor: tone }} /></View>
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: ink }}>Tension {Math.round(z.tension)}/100 <Text style={{ color: soft, fontFamily: F.mono }}>{ctx.resolved > 0 ? "· valeur de simulation" : "· valeur de départ du scénario"}</Text></Text>
          {z.control ? Object.entries(z.control).filter(([, v]) => v > 0).map(([id, v]) => (
            <Text key={id} style={{ fontFamily: F.sans, fontSize: 12, color: soft }}>{ctx.actors.find((a) => a.id === id)?.name ?? id} · {Math.round(v * 100)} % du contrôle</Text>
          )) : null}
        </>
      );
    }
  } else {
    const e = ctx.events.find((x) => x.id === sel.id);
    if (e) body = (
      <>
        <Text style={{ fontFamily: F.title, fontSize: 18, color: ink }}>{e.title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.3, color: soft, textTransform: "uppercase" }}>Événement · round {e.round}</Text>
        <Text numberOfLines={5} style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 17, color: soft }}>{e.text}</Text>
      </>
    );
  }
  if (!body) return null;
  return (
    <View style={{ position: "absolute", left: 14, bottom: ctx.geography.note ? 62 : 14, width: Math.min(330, width - 28), backgroundColor: bg, borderWidth: 1, borderColor: st.ink, padding: 12, gap: 5 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer le détail" onPress={onClose} style={{ position: "absolute", right: 6, top: 4, padding: 6, zIndex: 2 }}><Text style={{ color: soft, fontFamily: F.monoBold, fontSize: 13 }}>×</Text></Pressable>
      {body}
    </View>
  );
}
