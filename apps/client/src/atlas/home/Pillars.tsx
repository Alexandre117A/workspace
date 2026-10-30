import { useMemo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Defs, G, Line, Path, Pattern, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { geoGraticule10, geoMercator, geoPath } from "d3-geo";
import { C, F, S } from "../../theme";
import { PaperGrain } from "./PaperGrain";
import { useWorld } from "./world";

const INK = "#1B2A41", PAPER = "#F1EBDA", SEA = "#CFDADD", BRASS = "#8F7440", RED = "#963F46", ATLAS = "#284D74";

/** COMPRENDRE : une planche d'atlas (côtes réelles, graticule) sous une loupe, avec une fiche d'archive. */
function Understand({ w, h }: { w: number; h: number }) {
  const world = useWorld("110m");
  const d = useMemo(() => {
    if (!world) return null;
    const p = geoMercator().fitExtent([[6, 6], [w - 6, h - 6]], { type: "MultiPoint", coordinates: [[-12, 34], [42, 34], [42, 62], [-12, 62]] } as any);
    const path = geoPath(p);
    return { land: path(world.land) ?? "", grat: path(geoGraticule10()) ?? "", c: p([2.35, 48.85]) as [number, number] };
  }, [world, w, h]);
  return (
    <Svg width={w} height={h}>
      <Rect width={w} height={h} fill={SEA} />
      {d ? <><Path d={d.grat} stroke="#8EA4B4" strokeWidth={0.6} fill="none" /><Path d={d.land} fill="#F7F2E4" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
        <Circle cx={d.c[0]} cy={d.c[1]} r={34} fill="#F7F2E4" fillOpacity={0.35} stroke={INK} strokeWidth={1.6} />
        <Line x1={d.c[0] + 24} y1={d.c[1] + 24} x2={d.c[0] + 46} y2={d.c[1] + 46} stroke={INK} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={d.c[0]} cy={d.c[1]} r={3} fill={RED} /></> : null}
      <G transform={`translate(${w - 120} 14)`}>
        <Rect width={104} height={58} fill="#FAF6E8" stroke={INK} strokeWidth={0.8} />
        {[14, 24, 34, 44].map((y, i) => <Line key={y} x1={8} x2={i === 3 ? 60 : 94} y1={y} y2={y} stroke={i === 0 ? BRASS : "#8A8F96"} strokeWidth={i === 0 ? 2 : 1.2} />)}
      </G>
    </Svg>
  );
}

/** SIMULER : des acteurs autour d'une table, liés par des alliances (traits d'or) et des tensions (rouge). */
function Simulate({ w, h }: { w: number; h: number }) {
  const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) * 0.34;
  const nodes = ["A", "B", "C", "D", "E", "F"].map((l, i) => ({ l, x: cx + R * Math.cos((i / 6) * Math.PI * 2 - Math.PI / 2) * 1.5, y: cy + R * Math.sin((i / 6) * Math.PI * 2 - Math.PI / 2) }));
  const links: [number, number, "ally" | "war" | "talk"][] = [[0, 1, "ally"], [1, 2, "talk"], [2, 3, "war"], [3, 4, "ally"], [4, 5, "talk"], [5, 0, "talk"], [0, 3, "war"], [1, 4, "ally"]];
  return (
    <Svg width={w} height={h}>
      <Rect width={w} height={h} fill={PAPER} />
      <Defs><Pattern id="gp" width="14" height="14" patternUnits="userSpaceOnUse"><Path d="M14 0 L0 0 0 14" fill="none" stroke="#CFC6AB" strokeWidth={0.5} /></Pattern></Defs>
      <Rect width={w} height={h} fill="url(#gp)" />
      <Circle cx={cx} cy={cy} r={R * 0.55} fill="none" stroke={INK} strokeWidth={0.8} strokeDasharray="2,4" />
      {links.map(([a, b, k], i) => <Line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={k === "war" ? RED : k === "ally" ? BRASS : ATLAS} strokeWidth={k === "war" ? 2 : 1.4} strokeDasharray={k === "talk" ? "3,4" : undefined} />)}
      {nodes.map((n) => (
        <G key={n.l}><Circle cx={n.x} cy={n.y} r={13} fill="#10233D" stroke={BRASS} strokeWidth={1.4} /><SvgText x={n.x} y={n.y + 4.5} fontSize={12} fontFamily={F.title} fill="#F3F0E9" textAnchor="middle">{n.l}</SvgText></G>
      ))}
    </Svg>
  );
}

/** DÉCIDER : avant / après, un territoire qui change de main selon un choix, et les deux branches de la décision. */
function Decide({ w, h }: { w: number; h: number }) {
  const half = (w - 24) / 2, ph = h - 28;
  const state = (x: number, shift: number) => (
    <G transform={`translate(${x} 10)`}>
      <Rect width={half} height={ph} fill={SEA} stroke={INK} strokeWidth={0.8} />
      <Polygon points={`10,${ph - 8} 10,16 ${half * 0.5 + shift},10 ${half * 0.5 + shift - 8},${ph - 8}`} fill="#E5D3A4" stroke={INK} strokeWidth={0.9} />
      <Polygon points={`${half * 0.5 + shift},10 ${half - 10},22 ${half - 10},${ph - 8} ${half * 0.5 + shift - 8},${ph - 8}`} fill="#C9D4E4" stroke={INK} strokeWidth={0.9} />
      <Line x1={half * 0.5 + shift} y1={10} x2={half * 0.5 + shift - 8} y2={ph - 8} stroke={RED} strokeWidth={2} strokeDasharray="4,3" />
      <Circle cx={half * 0.32} cy={ph * 0.5} r={3.5} fill={INK} /><Circle cx={half * 0.72} cy={ph * 0.45} r={3.5} fill={ATLAS} />
    </G>
  );
  return (
    <Svg width={w} height={h}>
      <Rect width={w} height={h} fill={PAPER} />
      {state(6, 0)}{state(half + 18, 22)}
      <Path d={`M${half + 8},${h / 2 - 6} L${half + 17},${h / 2} L${half + 8},${h / 2 + 6} Z`} fill={BRASS} />
      <SvgText x={6 + half / 2} y={h - 4} fontSize={9} fontFamily={F.monoBold} fill={INK} textAnchor="middle">AVANT</SvgText>
      <SvgText x={half + 18 + half / 2} y={h - 4} fontSize={9} fontFamily={F.monoBold} fill={INK} textAnchor="middle">APRÈS</SvgText>
    </Svg>
  );
}

const ITEMS = [
  { id: "understand", kicker: "01", title: "Comprendre", text: "Explorer des situations historiques et contemporaines : acteurs, cartes, archives et rapports de force.", Art: Understand },
  { id: "simulate", kicker: "02", title: "Simuler", text: "Interpréter des acteurs et confronter des stratégies : diplomatie, alliances, négociations, tensions.", Art: Simulate },
  { id: "decide", kicker: "03", title: "Décider", text: "Faire des choix et observer leurs conséquences : le monde simulé évolue avec chaque décision.", Art: Decide },
] as const;

/** « Comprendre le monde. Simuler ses transformations. » : les trois promesses de la plateforme. */
export function Pillars({ width, desktop }: { width: number; desktop: boolean }) {
  const gap = S(4);
  const cw = desktop ? Math.floor((width - gap * 2) / 3) : width;
  return (
    <View style={{ gap: S(5) }}>
      <View style={{ gap: S(2), maxWidth: 760 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.4, color: C.brass, textTransform: "uppercase" }}>La promesse GEONEX</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: desktop ? 44 : 34, lineHeight: desktop ? 48 : 38, color: C.text, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>Comprendre le monde. Simuler ses transformations.</Text>
      </View>
      <View style={{ flexDirection: desktop ? "row" : "column", gap }}>
        {ITEMS.map(({ id, kicker, title, text, Art }) => (
          <View key={id} accessible accessibilityLabel={`${title}. ${text}`} style={{ width: cw, backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, borderTopWidth: 3, borderTopColor: C.brass, overflow: "hidden" }}>
            <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ borderBottomWidth: 1, borderBottomColor: C.lineHi }}>
              <Art w={cw - 2} h={Math.round((cw - 2) * (desktop ? 0.52 : 0.42))} />
              <PaperGrain opacity={0.7} />
            </View>
            <View style={{ padding: S(5), gap: S(2) }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 2.4, color: C.brass }}>{kicker}</Text>
              <Text style={{ fontFamily: F.title, fontSize: 32, color: C.text }}>{title}</Text>
              <Text style={{ fontFamily: F.sans, fontSize: 14.5, lineHeight: 22, color: C.muted }}>{text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
