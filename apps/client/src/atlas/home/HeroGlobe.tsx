import { createElement, useEffect, useMemo, useRef } from "react";
import { Platform, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { useReducedMotion } from "../../components/ui";
import { C, F } from "../../theme";
import { CatalogEntry, useCatalog, useWorld, XY } from "./world";

/**
 * Le globe de GEONEX : l'emblème de la marque (un globe gravé) devenu instrument vivant.
 * Terre gravée à la plume (hachures), méridiens, lunette graduée, liens entre capitales qui circulent, foyers de crise des scénarios
 * réellement disponibles qui pulsent. On le fait tourner du doigt ou de la souris, ou aux flèches du clavier. Rien n'est inventé :
 * les foyers sont les théâtres des fiches du catalogue ; les liens relient de vraies capitales (ornement signalé comme tel).
 * Sur le web : dessin sur canevas (fluide). Sur mobile natif : globe fixe en SVG. Animation coupée si l'utilisateur le demande.
 */
const CAPITALS: Record<string, XY> = {
  Washington: [-77.04, 38.9], Bruxelles: [4.35, 50.85], Moscou: [37.62, 55.75], Pékin: [116.4, 39.9], "New Delhi": [77.2, 28.6],
  Ankara: [32.85, 39.93], Brasília: [-47.9, -15.8], Pretoria: [28.19, -25.75], Tokyo: [139.7, 35.7], Canberra: [149.13, -35.28],
};
const LINKS: [string, string][] = [["Washington", "Bruxelles"], ["Bruxelles", "Moscou"], ["Moscou", "Pékin"], ["Pékin", "Tokyo"], ["Moscou", "New Delhi"], ["Bruxelles", "Ankara"], ["Ankara", "Pretoria"], ["Washington", "Brasília"], ["Pékin", "Canberra"]];
const FALLBACK: { name: string; at: XY }[] = [{ name: "Détroit de Taïwan", at: [119.6, 24.3] }, { name: "Détroit d'Ormuz", at: [56.25, 26.57] }, { name: "Cachemire", at: [74.3, 34.2] }, { name: "Caraïbes", at: [-80, 24] }];

function hotspots(entries: CatalogEntry[]) {
  const seen = new Set<string>();
  const out = entries.filter((e) => e.theatre.center).map((e) => ({ name: e.theatre.name, at: e.theatre.center as XY })).filter((h) => (seen.has(h.name) ? false : (seen.add(h.name), true)));
  return out.length ? out : FALLBACK;
}

function GlobeCanvas({ size, reduced }: { size: number; reduced: boolean }) {
  const world = useWorld("110m");
  const { entries } = useCatalog();
  const hot = useMemo(() => hotspots(entries), [entries]);
  const ref = useRef<any>(null);
  const state = useRef({ lon: 18, lat: 24, dragging: false, hover: false });

  useEffect(() => {
    const canvas = ref.current as HTMLCanvasElement | null;
    if (!canvas || !world) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2, R = size * 0.37;
    const proj = geoOrthographic().scale(R).translate([cx, cy]).clipAngle(90).precision(0.6);
    const path = geoPath(proj, ctx);
    const grat = geoGraticule10();
    const hatchCanvas = document.createElement("canvas");
    hatchCanvas.width = hatchCanvas.height = 6;
    const hc = hatchCanvas.getContext("2d")!;
    hc.strokeStyle = "rgba(243,240,233,0.42)"; hc.lineWidth = 0.9;
    hc.beginPath(); hc.moveTo(-1, 7); hc.lineTo(7, -1); hc.stroke();
    const hatch = ctx.createPattern(hatchCanvas, "repeat");
    const links = LINKS.map(([a, b]) => ({ type: "LineString", coordinates: [CAPITALS[a], CAPITALS[b]] }) as any);
    let raf = 0, last = performance.now(), visible = true;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || now - last < 30) return; // ~30 images/s suffisent et ménagent la batterie
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = state.current;
      if (!reduced && !s.dragging && !s.hover) s.lon = (s.lon + dt * 4.5) % 360;
      proj.rotate([-s.lon, -s.lat]);
      const t = now / 1000;
      ctx.clearRect(0, 0, size, size);

      // halo atmosphérique
      let g = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.28);
      g.addColorStop(0, "rgba(127,166,204,0.38)"); g.addColorStop(1, "rgba(127,166,204,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2); ctx.fill();

      // sphère
      g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      g.addColorStop(0, "#1B3D69"); g.addColorStop(0.6, "#10264A"); g.addColorStop(1, "#08162B");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // méridiens et parallèles
      ctx.beginPath(); path(grat); ctx.strokeStyle = "rgba(156,192,227,0.2)"; ctx.lineWidth = 0.6; ctx.stroke();
      // terres gravées : aplat bleu, hachures, côte claire
      ctx.beginPath(); path(world.land);
      ctx.fillStyle = "rgba(38,82,133,0.92)"; ctx.fill();
      if (hatch) { ctx.fillStyle = hatch; ctx.fill(); }
      ctx.strokeStyle = "rgba(190,214,238,0.9)"; ctx.lineWidth = 0.9; ctx.lineJoin = "round"; ctx.stroke();
      ctx.beginPath(); path(world.borders); ctx.strokeStyle = "rgba(190,214,238,0.28)"; ctx.lineWidth = 0.5; ctx.stroke();

      // assombrissement du bord (relief)
      g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.45, cx, cy, R);
      g.addColorStop(0, "rgba(3,8,16,0)"); g.addColorStop(1, "rgba(3,8,16,0.6)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // liens entre capitales : traits d'or qui circulent
      ctx.save();
      ctx.setLineDash([5, 7]); ctx.lineDashOffset = reduced ? 0 : -t * 14;
      ctx.strokeStyle = "rgba(201,164,92,0.85)"; ctx.lineWidth = 1.1;
      for (const l of links) { ctx.beginPath(); path(l); ctx.stroke(); }
      ctx.restore();

      const center: XY = [s.lon, s.lat];
      const front = (p: XY) => geoDistance(p, center) < Math.PI / 2 - 0.04;
      for (const c of Object.values(CAPITALS)) {
        if (!front(c)) continue;
        const p = proj(c); if (!p) continue;
        ctx.fillStyle = "#F3F0E9"; ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, Math.PI * 2); ctx.fill();
      }
      // foyers de crise : anneaux pour tous, étiquettes sans chevauchement (les plus proches du centre d'abord)
      ctx.font = `600 ${size < 360 ? 10 : 11.5}px IBMPlexSans_500Medium, sans-serif`;
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const visibleHot = hot.filter((h) => front(h.at)).sort((a, b) => geoDistance(a.at, center) - geoDistance(b.at, center));
      for (const h of visibleHot) {
        const p = proj(h.at); if (!p) continue;
        const ph = reduced ? 0.4 : (t * 0.55 + (h.at[0] % 7) / 7) % 1;
        ctx.strokeStyle = `rgba(214,96,104,${1 - ph})`; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p[0], p[1], 5 + ph * 18, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#E8878E"; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2); ctx.fill();
        const label = h.name.length > 24 ? h.name.slice(0, 23) + "…" : h.name;
        const w = ctx.measureText(label).width, box = { x0: p[0] + 8, y0: p[1] - 20, x1: p[0] + 12 + w, y1: p[1] - 2 };
        if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
        placed.push(box);
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(8,22,43,0.9)"; ctx.strokeText(label, p[0] + 9, p[1] - 7);
        ctx.fillStyle = "#F3F0E9"; ctx.fillText(label, p[0] + 9, p[1] - 7);
      }

      // lunette graduée (comme un instrument d'atlas) : tous les 5°, plus long tous les 10° et 30°
      ctx.save(); ctx.translate(cx, cy);
      ctx.strokeStyle = "rgba(243,240,233,0.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(184,154,93,0.55)"; ctx.beginPath(); ctx.arc(0, 0, R * 1.2, 0, Math.PI * 2); ctx.stroke();
      for (let a = 0; a < 360; a += 5) {
        const len = a % 30 === 0 ? 14 : a % 10 === 0 ? 9 : 5, rad = (a - 90) * Math.PI / 180;
        ctx.strokeStyle = a % 30 === 0 ? "rgba(184,154,93,0.9)" : "rgba(243,240,233,0.42)";
        ctx.beginPath(); ctx.moveTo(Math.cos(rad) * R * 1.1, Math.sin(rad) * R * 1.1); ctx.lineTo(Math.cos(rad) * (R * 1.1 + len), Math.sin(rad) * (R * 1.1 + len)); ctx.stroke();
      }
      ctx.fillStyle = "rgba(243,240,233,0.7)"; ctx.font = "600 10px IBMPlexMono_600SemiBold, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ([["N", 0], ["E", 90], ["S", 180], ["O", 270]] as [string, number][]).forEach(([l, a]) => { const rad = (a - 90) * Math.PI / 180; ctx.fillText(l, Math.cos(rad) * R * 1.31, Math.sin(rad) * R * 1.31); });
      ctx.restore();

      // lecture des coordonnées du centre de la vue
      ctx.font = "500 11px IBMPlexMono_400Regular, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "rgba(174,182,190,0.9)";
      const lon = ((s.lon + 540) % 360) - 180;
      ctx.fillText(`${Math.abs(s.lat).toFixed(1)}°${s.lat >= 0 ? "N" : "S"}   ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "O"}`, cx, size - 6);
    };
    raf = requestAnimationFrame(draw);

    // gestes : glisser pour tourner, flèches du clavier
    let px = 0, py = 0;
    const down = (e: PointerEvent) => { state.current.dragging = true; px = e.clientX; py = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!state.current.dragging) return;
      state.current.lon = (state.current.lon - (e.clientX - px) * 0.35 + 360) % 360;
      state.current.lat = Math.max(-70, Math.min(70, state.current.lat + (e.clientY - py) * 0.3));
      px = e.clientX; py = e.clientY;
    };
    const up = () => { state.current.dragging = false; };
    const enter = () => { state.current.hover = true; };
    const leave = () => { state.current.hover = false; state.current.dragging = false; };
    const key = (e: KeyboardEvent) => {
      const s = state.current;
      if (e.key === "ArrowLeft") s.lon = (s.lon - 10 + 360) % 360; else if (e.key === "ArrowRight") s.lon = (s.lon + 10) % 360;
      else if (e.key === "ArrowUp") s.lat = Math.min(70, s.lat + 8); else if (e.key === "ArrowDown") s.lat = Math.max(-70, s.lat - 8); else return;
      e.preventDefault();
    };
    const vis = () => { visible = !document.hidden; };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerenter", enter); canvas.addEventListener("pointerleave", leave); canvas.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerenter", enter); canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [size, world, hot, reduced]);

  return createElement("canvas", {
    ref, tabIndex: 0, role: "img",
    "aria-label": "Globe interactif de GEONEX : glissez ou utilisez les flèches du clavier pour le faire tourner. Les anneaux rouges marquent les foyers de crise des scénarios proposés.",
    style: { width: size, height: size, display: "block", touchAction: "none", cursor: "grab", outline: "none" },
  });
}

/** Globe fixe pour mobile natif (sans animation). */
export function StaticGlobe({ size }: { size: number }) {
  const world = useWorld("110m");
  const d = useMemo(() => {
    if (!world) return null;
    const R = size * 0.37;
    const proj = geoOrthographic().scale(R).translate([size / 2, size / 2]).clipAngle(90).rotate([-18, -24]);
    return { land: geoPath(proj)(world.land) ?? "", R };
  }, [world, size]);
  return (
    <Svg width={size} height={size}>
      <Defs><RadialGradient id="sg" cx="40%" cy="35%" r="70%"><Stop offset="0" stopColor="#1B3D69" /><Stop offset="1" stopColor="#08162B" /></RadialGradient></Defs>
      <Circle cx={size / 2} cy={size / 2} r={size * 0.37} fill="url(#sg)" />
      <G>{d ? <Path d={d.land} fill="#265285" stroke="#BED6EE" strokeWidth={0.8} /> : null}</G>
      <Circle cx={size / 2} cy={size / 2} r={size * 0.37 * 1.1} fill="none" stroke="#F3F0E9" strokeOpacity={0.5} />
      <Circle cx={size / 2} cy={size / 2} r={size * 0.37 * 1.2} fill="none" stroke="#B89A5D" strokeOpacity={0.55} />
    </Svg>
  );
}

export function HeroGlobe({ size }: { size: number }) {
  const reduced = useReducedMotion();
  return (
    <View style={{ width: size, alignItems: "center", gap: 8 }}>
      <View style={{ width: size, height: size }}>{Platform.OS === "web" ? <GlobeCanvas size={size} reduced={reduced} /> : <StaticGlobe size={size} />}</View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#E8878E" }} /><Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>Foyers de crise des scénarios</Text></View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 16, height: 0, borderTopWidth: 1.5, borderTopColor: C.brass, borderStyle: "dashed" }} /><Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>Liens entre capitales (ornement)</Text></View>
        {Platform.OS === "web" ? <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>Glisser pour tourner</Text> : null}
      </View>
    </View>
  );
}
