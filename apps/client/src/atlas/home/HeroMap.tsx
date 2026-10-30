import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Platform, Pressable, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { geoConicConformal, geoGraticule, geoPath } from "d3-geo";
import { useReducedMotion } from "../../components/ui";
import { C, F } from "../../theme";
import { arcPath, useWorld, XY } from "./world";

/** Papier d'atlas : grain (web uniquement), superposé au fond de la carte. */
export function PaperGrain({ opacity = 1 }: { opacity?: number }) {
  if (Platform.OS !== "web") return null;
  const uri = (Image as any).resolveAssetSource?.(require("../../../assets/atlas/paper.png"))?.uri;
  if (!uri) return null;
  return <View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, opacity }, { backgroundImage: `url(${uri})`, backgroundRepeat: "repeat", mixBlendMode: "multiply" } as any]} />;
}

const INK = "#1B2A41", PAPER = "#F1EBDA", SEA = "#C9D7DC", LAND = "#F7F2E4", BORDER = "#6C86A3", BRASS = "#8F7440", RED = "#963F46";

/** Régions d'intérêt stratégique : repères géographiques réels (détroits, mers, capitales), pas des données de simulation. */
const REGIONS: { id: string; name: string; at: XY; note: string; links: string[] }[] = [
  { id: "brussels", name: "Bruxelles", at: [4.35, 50.85], note: "Siège de l'OTAN et de grandes institutions de l'Union européenne.", links: ["moscow", "gibraltar"] },
  { id: "moscow", name: "Moscou", at: [37.62, 55.75], note: "Capitale de la Russie, plus vaste État du continent.", links: ["baltic", "caucasus"] },
  { id: "baltic", name: "Mer Baltique", at: [19.5, 58.0], note: "Mer presque fermée bordée par neuf États riverains.", links: ["brussels"] },
  { id: "gibraltar", name: "Gibraltar", at: [-5.35, 36.0], note: "Environ 14 km séparent l'Europe de l'Afrique à son point le plus étroit.", links: ["suez"] },
  { id: "bosphorus", name: "Détroits turcs", at: [29.0, 41.1], note: "Bosphore et Dardanelles : seul passage entre la mer Noire et la Méditerranée.", links: ["suez", "caucasus"] },
  { id: "suez", name: "Canal de Suez", at: [32.35, 30.5], note: "Relie la Méditerranée à la mer Rouge depuis 1869.", links: [] },
  { id: "caucasus", name: "Caucase", at: [44.0, 42.2], note: "Isthme entre la mer Noire et la mer Caspienne.", links: [] },
];

export function HeroMap({ width, height }: { width: number; height: number }) {
  const world = useWorld();
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const appear = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const pad = 22;

  useEffect(() => {
    if (reduced) return appear.setValue(1);
    Animated.timing(appear, { toValue: 1, duration: 1100, useNativeDriver: true }).start();
  }, [reduced]);

  const geo = useMemo(() => {
    if (!world) return null;
    const projection = geoConicConformal().parallels([38, 62]).rotate([-30, 0]);
    projection.fitExtent([[pad, pad + 54], [width - pad, height - pad - 20]], { type: "MultiPoint", coordinates: [[-12, 33], [-12, 66], [30, 72], [78, 66], [78, 33], [30, 30]] } as any);
    const path = geoPath(projection);
    const countries = world.countries.map((f: any) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      return x1 < -20 || x0 > width + 20 || y1 < -20 || y0 > height + 20 ? null : { id: String(f.id), d: path(f) ?? "" };
    }).filter(Boolean) as { id: string; d: string }[];
    const pts = REGIONS.map((r) => ({ ...r, xy: projection(r.at) as XY }));
    const links: { key: string; d: string; a: string; b: string }[] = [];
    for (const r of REGIONS) for (const l of r.links) links.push({ key: `${r.id}-${l}`, a: r.id, b: l, d: arcPath(projection as any, r.at, REGIONS.find((x) => x.id === l)!.at) });
    return { projection, countries, pts, links, graticule: path(geoGraticule().step([10, 10])()) ?? "" };
  }, [world, width, height]);

  const web = Platform.OS === "web";
  const onMove = (e: any) => {
    if (reduced || !web) return;
    const r = e.currentTarget?.getBoundingClientRect?.();
    if (!r) return;
    setShift({ x: ((e.clientX - r.left) / r.width - 0.5) * -7, y: ((e.clientY - r.top) / r.height - 0.5) * -5 });
  };
  const act = REGIONS.find((r) => r.id === active);
  const activeXY = geo?.pts.find((p) => p.id === active)?.xy;

  return (
    <View accessibilityLabel="Carte d'atlas de l'Europe, de la Méditerranée et de l'Eurasie, avec sept repères géographiques" style={[{ width, height, backgroundColor: PAPER, borderWidth: 1, borderColor: "#B9AE92", overflow: "hidden" }, web ? ({ boxShadow: "0 22px 60px rgba(0,0,0,0.45)" } as any) : null]}
      {...(web ? ({ onMouseMove: onMove, onMouseLeave: () => setShift({ x: 0, y: 0 }) } as any) : {})}>
      <Animated.View style={{ flex: 1, opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id="hv" cx="50%" cy="48%" r="75%"><Stop offset="0.55" stopColor="#3B2F1E" stopOpacity="0" /><Stop offset="1" stopColor="#3B2F1E" stopOpacity="0.22" /></RadialGradient>
          </Defs>
          <Rect width={width} height={height} fill={SEA} />
          {geo ? (
            <G transform={`translate(${shift.x} ${shift.y})`}>
              <Path d={geo.graticule} stroke="#8EA4B4" strokeWidth={0.6} fill="none" opacity={0.7} />
              {geo.countries.map((c) => <Path key={c.id} d={c.d} fill={LAND} stroke={BORDER} strokeWidth={0.55} strokeLinejoin="round" />)}
              {geo.links.map((l) => {
                const on = active === l.a || active === l.b;
                return <Path key={l.key} d={l.d} fill="none" stroke={on ? RED : BRASS} strokeWidth={on ? 1.8 : 1} strokeDasharray="3,4" opacity={on ? 0.95 : 0.55} />;
              })}
              {geo.pts.map((p) => (
                <G key={p.id}>
                  {active === p.id ? <Circle cx={p.xy[0]} cy={p.xy[1]} r={15} fill={RED} opacity={0.14} /> : null}
                  <Circle cx={p.xy[0]} cy={p.xy[1]} r={active === p.id ? 6 : 4.2} fill={active === p.id ? RED : INK} stroke={PAPER} strokeWidth={1.5} />
                  <SvgText x={p.xy[0] + 9} y={p.xy[1] + 3.5} fontSize={10.5} fontFamily={F.sansMed} fill={PAPER} stroke={PAPER} strokeWidth={3} strokeLinejoin="round" opacity={0.9}>{p.name}</SvgText>
                  <SvgText x={p.xy[0] + 9} y={p.xy[1] + 3.5} fontSize={10.5} fontFamily={F.sansMed} fill={INK}>{p.name}</SvgText>
                </G>
              ))}
            </G>
          ) : <SvgText x={width / 2} y={height / 2} textAnchor="middle" fontSize={11} fontFamily={F.mono} fill="#5B6B7C">Chargement de la carte…</SvgText>}
          <Rect width={width} height={height} fill="url(#hv)" />
          <Rect x={5.5} y={5.5} width={width - 11} height={height - 11} fill="none" stroke={INK} strokeWidth={1} opacity={0.6} />
          <Rect x={10.5} y={10.5} width={width - 21} height={height - 21} fill="none" stroke={INK} strokeWidth={0.5} opacity={0.4} />
          {/* Rose des vents */}
          <G transform={`translate(${width - 44} ${height - 46})`} opacity={0.75}>
            <Circle r={15} fill="none" stroke={INK} strokeWidth={0.8} />
            <Path d="M0,-21 L4,0 L0,21 L-4,0 Z" fill={INK} opacity={0.85} />
            <Path d="M-21,0 L0,-3 L21,0 L0,3 Z" fill="none" stroke={INK} strokeWidth={0.8} />
            <SvgText y={-25} fontSize={9} fontFamily={F.monoBold} textAnchor="middle" fill={INK}>N</SvgText>
          </G>
        </Svg>
        <PaperGrain opacity={0.9} />
        {/* Cartouche éditorial */}
        <View pointerEvents="none" style={{ position: "absolute", left: 22, top: 20, maxWidth: width - 60 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2.4, color: BRASS }}>ATLAS GÉOPOLITIQUE</Text>
          <Text style={{ fontFamily: F.title, fontSize: width < 420 ? 22 : 28, color: INK, lineHeight: width < 420 ? 26 : 32 }}>Europe · Méditerranée · Eurasie</Text>
        </View>
        {/* Repères interactifs : survol, focus clavier ou toucher */}
        {geo?.pts.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.name} : ${p.note}`} onPress={() => setActive(active === p.id ? null : p.id)}
            {...(web ? ({ onMouseEnter: () => setActive(p.id), onMouseLeave: () => setActive((a) => (a === p.id ? null : a)), onFocus: () => setActive(p.id), onBlur: () => setActive((a) => (a === p.id ? null : a)) } as any) : {})}
            style={{ position: "absolute", left: p.xy[0] + shift.x - 16, top: p.xy[1] + shift.y - 16, width: 32, height: 32 }} />
        ))}
        {act && activeXY ? (
          <View pointerEvents="none" style={{ position: "absolute", left: Math.min(Math.max(12, activeXY[0] - 110), width - 232), top: activeXY[1] > height * 0.62 ? activeXY[1] - 96 : activeXY[1] + 20, width: 220, backgroundColor: "#10233DF2", borderLeftWidth: 3, borderLeftColor: BRASS, padding: 10, gap: 3 }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.8, color: C.brass, textTransform: "uppercase" }}>{act.name}</Text>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 17, color: C.text }}>{act.note}</Text>
          </View>
        ) : null}
        <View pointerEvents="none" style={{ position: "absolute", left: 22, bottom: 16, flexDirection: "row", gap: 14, alignItems: "center" }}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: INK }} /><Text style={{ fontFamily: F.mono, fontSize: 9.5, color: INK }}>Région d'intérêt stratégique</Text></View>
        </View>
      </Animated.View>
    </View>
  );
}
