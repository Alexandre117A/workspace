import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Pattern, Polygon, Rect, Stop, Text as SvgText } from "react-native-svg";
import { useLayout, useReducedMotion } from "./ui";
import { PHOTOS } from "../content/photos";
import { C, F } from "../theme";

/**
 * « Chronique » : UNE seule scène continue qui défile du haut vers le bas, sans case ni cadre.
 * Courbes de niveau, méridiens, silhouettes d'équipements (illustrations vectorielles originales)
 * et légendes flottantes se fondent dans un même plan ; la teinte glisse du sépia (histoire)
 * à l'acier (monde contemporain). La scène est périodique : la boucle ne montre aucune couture.
 * Les photographies déposées dans `content/photos.ts` s'insèrent dans la même scène en fondu.
 */
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Kind = "carrier" | "destroyer" | "jet" | "tanker" | "sail" | "summit" | "airlift" | "missile" | "sat" | "skyline" | "tank";
interface Item { y: number; x: number; s: number; kind: Kind; year: string; label: string; tone: "sepia" | "steel"; flip?: boolean }

// y en fraction de la hauteur de la scène (0,05–0,95 : les bords restent vides pour une boucle invisible)
const ITEMS: Item[] = [
  { y: 0.06, x: 0.1, s: 0.9, kind: "summit", year: "1815", label: "CONGRÈS DE VIENNE", tone: "sepia" },
  { y: 0.14, x: 0.5, s: 1.1, kind: "sail", year: "1805", label: "TRAFALGAR", tone: "sepia" },
  { y: 0.23, x: 0.05, s: 1.0, kind: "summit", year: "1945", label: "CONFÉRENCE DE YALTA", tone: "sepia", flip: true },
  { y: 0.31, x: 0.45, s: 1.15, kind: "airlift", year: "1948", label: "PONT AÉRIEN DE BERLIN", tone: "sepia" },
  { y: 0.4, x: 0.08, s: 1.0, kind: "destroyer", year: "1956", label: "CRISE DE SUEZ", tone: "sepia" },
  { y: 0.48, x: 0.5, s: 1.0, kind: "missile", year: "1962", label: "CRISE DES MISSILES DE CUBA", tone: "sepia" },
  { y: 0.56, x: 0.06, s: 1.1, kind: "tank", year: "1989", label: "GUERRE FROIDE · LE RIDEAU SE LÈVE", tone: "steel" },
  { y: 0.64, x: 0.5, s: 1.25, kind: "tanker", year: "AUJOURD'HUI", label: "DÉTROIT D'ORMUZ", tone: "steel" },
  { y: 0.73, x: 0.05, s: 1.3, kind: "carrier", year: "AUJOURD'HUI", label: "MER DE CHINE MÉRIDIONALE", tone: "steel" },
  { y: 0.82, x: 0.55, s: 1.0, kind: "jet", year: "AUJOURD'HUI", label: "SUPRÉMATIE AÉRIENNE", tone: "steel" },
  { y: 0.89, x: 0.08, s: 0.9, kind: "sat", year: "AUJOURD'HUI", label: "COMPÉTITION SPATIALE", tone: "steel" },
  { y: 0.95, x: 0.52, s: 1.0, kind: "skyline", year: "DEPUIS 1999", label: "SOMMETS DU G20", tone: "steel" },
];

function Silhouette({ kind, c }: { kind: Kind; c: string }) {
  const f = { fill: c } as const;
  const s = { stroke: c, strokeWidth: 1.4, fill: "none" } as const;
  switch (kind) {
    case "carrier":
      return (
        <G>
          <Path d="M0 120 L40 100 L380 100 L400 120 L370 138 L30 138 Z" {...f} opacity={0.9} />
          <Rect x="40" y="94" width="330" height="6" {...f} opacity={0.6} />
          <Path d="M250 94 L250 66 L276 62 L290 70 L290 94 Z" {...f} />
          <Line x1="270" y1="62" x2="270" y2="40" {...s} /><Path d="M262 46 L278 46" {...s} />
          {[70, 100, 128, 160, 190].map((x, i) => <Polygon key={x} points={`${x},94 ${x + 14},91 ${x + 20},94 ${x + 14},97`} {...f} opacity={0.85 - i * 0.1} />)}
          <Path d="M0 148 Q50 140 100 148 T200 148 T300 148 T400 148" {...s} opacity={0.5} /><Path d="M0 158 Q50 150 100 158 T200 158 T300 158 T400 158" {...s} opacity={0.3} />
        </G>
      );
    case "destroyer":
      return (
        <G>
          <Path d="M10 112 L330 112 L300 134 L38 134 Z" {...f} />
          <Path d="M110 112 L120 90 L220 90 L236 112 Z" {...f} opacity={0.85} /><Rect x="150" y="70" width="40" height="20" {...f} opacity={0.8} />
          <Line x1="170" y1="70" x2="170" y2="36" {...s} /><Line x1="156" y1="50" x2="184" y2="50" {...s} /><Circle cx="170" cy="36" r="4" {...f} />
          <Path d="M270 112 L290 100 L322 100 L322 106 L292 106" {...s} />
          {[0, 1, 2, 3, 4].map((i) => <Rect key={i} x={56 + i * 9} y="106" width="6" height="6" {...f} opacity={0.6} />)}
          <Path d="M0 144 Q60 134 120 144 T240 144 T360 144" {...s} opacity={0.45} />
        </G>
      );
    case "jet":
      return (
        <G>
          <Polygon points="30,110 250,96 330,60 340,66 316,102 340,138 330,144 250,124" {...f} opacity={0.92} />
          <Polygon points="190,108 240,40 258,44 236,106" {...f} opacity={0.65} /><Polygon points="190,112 240,180 258,176 236,114" {...f} opacity={0.65} />
          <Polygon points="40,108 20,100 18,110 34,114" {...f} opacity={0.5} />
          {[0, 1, 2].map((i) => <Path key={i} d={`M${-20 - i * 10} ${106 + i * 6} Q60 ${112 + i * 6} 30 ${110}`} {...s} opacity={0.45 - i * 0.1} />)}
        </G>
      );
    case "airlift":
      return (
        <G>
          <Path d="M20 110 Q60 96 150 96 L330 98 L350 90 L362 92 L346 108 L330 112 L150 116 Q60 122 20 110 Z" {...f} />
          <Path d="M170 98 L210 52 L230 54 L212 98 Z" {...f} opacity={0.7} /><Path d="M170 114 L210 164 L230 162 L212 114 Z" {...f} opacity={0.7} />
          {[196, 230, 262].map((x) => <Ellipse key={x} cx={x} cy="116" rx="9" ry="5" {...f} opacity={0.6} />)}
          <Path d="M-10 140 Q80 130 160 138" {...s} opacity={0.35} strokeDasharray="4 6" />
        </G>
      );
    case "tanker":
      return (
        <G>
          <Path d="M0 114 L400 114 L370 138 L26 138 Z" {...f} />
          <Rect x="330" y="76" width="44" height="38" {...f} opacity={0.8} /><Rect x="350" y="58" width="12" height="18" {...f} opacity={0.8} />
          {Array.from({ length: 8 }).map((_, i) => <Ellipse key={i} cx={40 + i * 36} cy="110" rx="15" ry="6" {...f} opacity={0.55} />)}
          <Path d="M30 108 L320 108" {...s} opacity={0.6} />
          <Path d="M0 150 Q70 138 140 150 T280 150 T400 150" {...s} opacity={0.4} />
        </G>
      );
    case "sail":
      return (
        <G>
          <Path d="M20 120 Q200 138 360 118 L340 140 Q200 156 40 142 Z" {...f} />
          {[110, 200, 290].map((x, i) => (
            <G key={x}>
              <Line x1={x} y1="124" x2={x} y2={30 + i * 10} {...s} />
              <Path d={`M${x + 2} ${36 + i * 10} Q${x + 44} ${70 + i * 10} ${x + 2} ${106}`} {...f} opacity={0.55} />
              <Path d={`M${x - 2} ${44 + i * 10} Q${x - 40} ${74 + i * 10} ${x - 2} ${108}`} {...f} opacity={0.4} />
            </G>
          ))}
          <Path d="M290 30 L316 36 L290 44 Z" {...f} />
          <Path d="M0 156 Q50 148 100 156 T200 156 T300 156 T400 156" {...s} opacity={0.4} />
        </G>
      );
    case "summit":
      return (
        <G>
          <Ellipse cx="200" cy="120" rx="120" ry="30" {...s} /><Ellipse cx="200" cy="120" rx="92" ry="20" {...s} opacity={0.45} />
          {Array.from({ length: 10 }).map((_, i) => { const a = (i / 10) * Math.PI * 2; return <Circle key={i} cx={200 + Math.cos(a) * 138} cy={120 + Math.sin(a) * 40} r="8" {...f} opacity={0.85} />; })}
          {[90, 200, 310].map((x) => <G key={x}><Line x1={x} y1="30" x2={x} y2="76" {...s} /><Path d={`M${x} 30 L${x + 30} 38 L${x} 50 Z`} {...f} opacity={0.8} /></G>)}
        </G>
      );
    case "missile":
      return (
        <G>
          {[22, 44, 66, 88].map((r) => <Circle key={r} cx="290" cy="110" r={r} {...s} opacity={0.35} />)}
          <Polygon points="30,150 220,70 232,82 46,164" {...f} />
          <Polygon points="220,70 262,44 232,82" {...f} /><Polygon points="30,150 8,134 24,126 46,142" {...f} opacity={0.65} />
          <Line x1="290" y1="20" x2="290" y2="200" {...s} opacity={0.3} /><Line x1="190" y1="110" x2="390" y2="110" {...s} opacity={0.3} />
        </G>
      );
    case "sat":
      return (
        <G>
          <Path d="M0 200 Q200 40 400 200" {...s} /><Path d="M0 200 Q200 14 400 200" {...s} opacity={0.35} strokeDasharray="4 6" />
          <G transform="translate(240,70) rotate(-20)"><Rect x="-14" y="-10" width="28" height="20" {...f} /><Rect x="-64" y="-6" width="44" height="12" {...f} opacity={0.65} /><Rect x="20" y="-6" width="44" height="12" {...f} opacity={0.65} /><Circle cx="0" cy="-18" r="5" {...s} /></G>
          {Array.from({ length: 14 }).map((_, i) => <Circle key={i} cx={20 + i * 28} cy={30 + ((i * 37) % 60)} r="1.4" {...f} opacity={0.7} />)}
        </G>
      );
    case "skyline":
      return (
        <G>
          <Rect x="0" y="140" width="400" height="6" {...f} opacity={0.7} />
          {[[10, 70, 30], [44, 40, 26], [74, 86, 34], [112, 56, 28], [144, 100, 40], [188, 62, 26], [220, 82, 32], [256, 46, 24], [284, 94, 38], [326, 64, 28], [358, 78, 30]].map(([x, h, w], i) => <Rect key={i} x={x} y={140 - h} width={w} height={h} {...f} opacity={0.6 + (i % 3) * 0.1} />)}
          <Path d="M144 40 Q164 6 184 40 Z" {...f} opacity={0.85} /><Line x1="164" y1="6" x2="164" y2="-12" {...s} />
        </G>
      );
    default:
      return (
        <G>
          <Path d="M20 130 L360 130 L350 148 L30 148 Z" {...f} />
          {Array.from({ length: 8 }).map((_, i) => <Circle key={i} cx={46 + i * 40} cy="146" r="9" {...f} opacity={0.7} />)}
          <Path d="M90 130 L110 100 L270 100 L300 130 Z" {...f} opacity={0.9} />
          <Rect x="130" y="82" width="110" height="20" {...f} opacity={0.85} /><Rect x="240" y="88" width="120" height="7" {...f} />
        </G>
      );
  }
}

const SEPIA = "#D9BE8A";
const STEEL = "#9DB7D4";

function Scene({ w, h, phase }: { w: number; h: number; phase: Animated.Value }) {
  const lines = 30;
  const drift = phase.interpolate({ inputRange: [0, 1], outputRange: [0, -120] });
  const curves = useMemo(
    () => [
      { d: `M ${w * 0.05} ${h * 0.12} C ${w * 0.3} ${h * 0.02}, ${w * 0.5} ${h * 0.2}, ${w * 0.95} ${h * 0.09}`, c: SEPIA, len: w * 1.1 },
      { d: `M ${w * 0.1} ${h * 0.36} C ${w * 0.4} ${h * 0.3}, ${w * 0.6} ${h * 0.44}, ${w * 0.92} ${h * 0.34}`, c: SEPIA, len: w * 1.1 },
      { d: `M ${w * 0.04} ${h * 0.6} C ${w * 0.3} ${h * 0.54}, ${w * 0.55} ${h * 0.7}, ${w * 0.96} ${h * 0.58}`, c: STEEL, len: w * 1.1 },
      { d: `M ${w * 0.08} ${h * 0.78} C ${w * 0.35} ${h * 0.7}, ${w * 0.6} ${h * 0.86}, ${w * 0.94} ${h * 0.76}`, c: STEEL, len: w * 1.1 },
      { d: `M ${w * 0.02} ${h * 0.92} C ${w * 0.3} ${h * 0.86}, ${w * 0.6} ${h * 0.98}, ${w} ${h * 0.9}`, c: STEEL, len: w * 1.1 },
    ],
    [w, h],
  );
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#10141B" /><Stop offset="0.25" stopColor="#241B10" /><Stop offset="0.5" stopColor="#10141B" />
          <Stop offset="0.75" stopColor="#0C1928" /><Stop offset="1" stopColor="#10141B" />
        </LinearGradient>
        <LinearGradient id="ink" x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6B6A66" /><Stop offset="0.25" stopColor={SEPIA} /><Stop offset="0.5" stopColor="#6B6A66" />
          <Stop offset="0.75" stopColor={STEEL} /><Stop offset="1" stopColor="#6B6A66" />
        </LinearGradient>
        <Pattern id="grain" width="5" height="5" patternUnits="userSpaceOnUse"><Rect width="1" height="1" fill="#fff" opacity={0.07} /><Rect x="3" y="2" width="1" height="1" fill="#fff" opacity={0.05} /></Pattern>
      </Defs>
      <Rect width={w} height={h} fill="url(#bg)" />
      {/* courbes de niveau : périodiques en y, donc sans couture à la boucle */}
      {Array.from({ length: lines }).map((_, k) => {
        const base = (k / lines) * h;
        const amp = 26 + (k % 5) * 6;
        const ph = k * 0.7;
        let d = `M 0 ${base}`;
        for (let x = 0; x <= w; x += 40) d += ` L ${x} ${base + Math.sin((x / w) * Math.PI * 3 + ph) * amp}`;
        return <Path key={k} d={d} stroke="url(#ink)" strokeWidth={k % 5 === 0 ? 1.2 : 0.6} fill="none" opacity={k % 5 === 0 ? 0.32 : 0.16} />;
      })}
      {/* méridiens */}
      {Array.from({ length: 9 }).map((_, i) => {
        const x = (i / 8) * w;
        return <Path key={i} d={`M ${x} 0 Q ${x + (i - 4) * 18} ${h / 2} ${x} ${h}`} stroke="url(#ink)" strokeWidth={0.5} fill="none" opacity={0.14} />;
      })}
      {ITEMS.map((it, i) => {
        const size = Math.min(w * 0.46, 520) * it.s;
        const x = it.x * w;
        const y = it.y * h;
        const ink = it.tone === "sepia" ? SEPIA : STEEL;
        return (
          <G key={i} transform={`translate(${x},${y})`}>
            <G transform={`scale(${size / 400})`} opacity={0.5}>
              <G transform={it.flip ? "translate(400,0) scale(-1,1)" : undefined}><Silhouette kind={it.kind} c={ink} /></G>
            </G>
            <Line x1="0" y1={size * 0.52} x2={size * 0.34} y2={size * 0.52} stroke={ink} strokeWidth={0.8} opacity={0.7} />
            <SvgText x="0" y={size * 0.52 + 16} fill={ink} fontSize="10" fontFamily={F.monoBold} letterSpacing="3" opacity={0.85}>{it.year}</SvgText>
            <SvgText x="0" y={size * 0.52 + 34} fill="#EDE6D4" fontSize="15" fontFamily={F.title} opacity={0.8}>{it.label}</SvgText>
          </G>
        );
      })}
      {/* courbes qui se dessinent : routes, trajectoires, tensions */}
      {curves.map((c, i) => (
        <AnimatedPath key={i} d={c.d} stroke={c.c} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.55}
          strokeDasharray={`${c.len * 0.35} ${c.len * 0.65}`} strokeDashoffset={phase.interpolate({ inputRange: [0, 1], outputRange: [i % 2 ? c.len : 0, i % 2 ? 0 : c.len] }) as any} />
      ))}
      <Rect width={w} height={h} fill="url(#grain)" />
    </Svg>
  );
}

/** Photographie fondue dans la scène : noir et blanc, bords dissous dans le décor (aucune frontière visible). */
function PhotoBand({ p, w, top }: { p: { src: number; year: string; label: string }; w: number; top: number }) {
  const bh = 380;
  const gray: any = { filter: "grayscale(1) contrast(1.15) brightness(0.8)" };
  return (
    <View style={{ position: "absolute", left: 0, top, width: w, height: bh }}>
      <Image source={p.src} resizeMode="cover" style={[{ width: w, height: bh, opacity: 0.85 }, gray]} />
      <Svg style={StyleSheet.absoluteFill} width={w} height={bh}>
        <Defs>
          <LinearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#10141B" stopOpacity="1" /><Stop offset="0.3" stopColor="#10141B" stopOpacity="0" /><Stop offset="0.7" stopColor="#10141B" stopOpacity="0" /><Stop offset="1" stopColor="#10141B" stopOpacity="1" /></LinearGradient>
          <LinearGradient id="ps" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#10141B" stopOpacity="1" /><Stop offset="0.22" stopColor="#10141B" stopOpacity="0" /><Stop offset="0.78" stopColor="#10141B" stopOpacity="0" /><Stop offset="1" stopColor="#10141B" stopOpacity="1" /></LinearGradient>
        </Defs>
        <Rect width={w} height={bh} fill="url(#ps)" /><Rect width={w} height={bh} fill="url(#pf)" />
        <SvgText x={w * 0.06} y={bh * 0.78} fill={STEEL} fontSize="10" fontFamily={F.monoBold} letterSpacing="3">{p.year}</SvgText>
        <SvgText x={w * 0.06} y={bh * 0.78 + 18} fill="#EDE6D4" fontSize="15" fontFamily={F.title}>{p.label}</SvgText>
      </Svg>
    </View>
  );
}

/** Fond défilant. `strength` règle la visibilité (0.1 discret → 0.6 mis en avant). */
export function Chronicle({ strength = 0.4 }: { strength?: number }) {
  const { width, height } = useLayout();
  const reduced = useReducedMotion();
  const scroll = useRef(new Animated.Value(0)).current;
  const phase = useRef(new Animated.Value(0)).current;
  const w = Math.max(320, Math.round(width));
  const h = Math.max(1900, Math.round(height * 2.4));
  useEffect(() => {
    if (reduced) return;
    scroll.setValue(0);
    const a = Animated.loop(Animated.timing(scroll, { toValue: 1, duration: (h / 20) * 1000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(phase, { toValue: 0, duration: 0, useNativeDriver: false }),
    ]));
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [reduced, h]);
  const y = scroll.interpolate({ inputRange: [0, 1], outputRange: [-h, 0] });
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: strength, overflow: "hidden" }]} pointerEvents="none">
      <Animated.View style={{ position: "absolute", left: 0, top: 0, width: w, transform: [{ translateY: reduced ? -h * 0.4 : y }] }}>
        <Scene w={w} h={h} phase={phase} />
        <View style={{ marginTop: -1 }}><Scene w={w} h={h} phase={phase} /></View>
        {[0, 1].map((k) => PHOTOS.map((p, i) => <PhotoBand key={`${k}-${i}`} p={p} w={w} top={k * h + ((i + 0.5) / PHOTOS.length) * h - 190} />))}
      </Animated.View>
    </View>
  );
}

/** Voile dégradé et vignette : garde les textes lisibles et fond les bords dans le décor. */
export function ChronicleVeil() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bg} stopOpacity="0.8" />
          <Stop offset="0.4" stopColor={C.bg} stopOpacity="0.3" />
          <Stop offset="1" stopColor={C.bg} stopOpacity="0.88" />
        </LinearGradient>
        <LinearGradient id="side" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.bg} stopOpacity="0.55" /><Stop offset="0.25" stopColor={C.bg} stopOpacity="0" />
          <Stop offset="0.75" stopColor={C.bg} stopOpacity="0" /><Stop offset="1" stopColor={C.bg} stopOpacity="0.55" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#veil)" />
      <Rect width="100%" height="100%" fill="url(#side)" />
    </Svg>
  );
}
