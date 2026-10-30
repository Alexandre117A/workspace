import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Pattern, Polygon, Rect, Stop, Text as SvgText } from "react-native-svg";
import { useLayout, useReducedMotion } from "./ui";
import { C, F } from "../theme";

/**
 * « Chronique » : planches illustrées d'événements géopolitiques (historiques et contemporains)
 * qui défilent du haut vers le bas en arrière-plan. Ce sont des illustrations ORIGINALES dessinées
 * en vectoriel (pas des photographies) ; les légendes sont des repères généraux.
 */
type Motif = "summit" | "treaty" | "plane" | "ship" | "missile" | "wall" | "map" | "sat" | "tanker";
interface PlateData { year: string; title: string; caption: string; motif: Motif; tone: "sepia" | "steel" }

export const PLATES: PlateData[] = [
  { year: "1815", title: "Congrès de Vienne", caption: "Les puissances redessinent l'Europe après Napoléon", motif: "summit", tone: "sepia" },
  { year: "1815", title: "Waterloo", caption: "18 juin : fin de l'épopée napoléonienne", motif: "map", tone: "sepia" },
  { year: "1919", title: "Traité de Versailles", caption: "Un ordre d'après-guerre aux conséquences durables", motif: "treaty", tone: "sepia" },
  { year: "1945", title: "Conférence de Yalta", caption: "Trois dirigeants, une Europe à partager", motif: "summit", tone: "sepia" },
  { year: "1948", title: "Pont aérien de Berlin", caption: "Ravitailler une ville assiégée par les airs", motif: "plane", tone: "sepia" },
  { year: "1956", title: "Crise de Suez", caption: "Le canal, enjeu de puissance entre anciennes et nouvelles puissances", motif: "ship", tone: "sepia" },
  { year: "1962", title: "Crise des missiles de Cuba", caption: "Treize jours au bord de la guerre nucléaire", motif: "missile", tone: "sepia" },
  { year: "1989", title: "Chute du mur de Berlin", caption: "9 novembre : la fin d'une frontière symbole", motif: "wall", tone: "sepia" },
  { year: "Aujourd'hui", title: "Détroit d'Ormuz", caption: "Environ un cinquième du pétrole mondial y transite", motif: "tanker", tone: "steel" },
  { year: "Aujourd'hui", title: "Mer de Chine méridionale", caption: "Routes maritimes et revendications concurrentes", motif: "map", tone: "steel" },
  { year: "2021", title: "Canal de Suez bloqué", caption: "Un porte-conteneurs paralyse le trafic pendant six jours", motif: "ship", tone: "steel" },
  { year: "Aujourd'hui", title: "Arctique", caption: "Nouvelles routes maritimes, nouvelles rivalités", motif: "map", tone: "steel" },
  { year: "Depuis 1999", title: "Sommets du G20", caption: "Les grandes économies autour d'une même table", motif: "summit", tone: "steel" },
  { year: "Aujourd'hui", title: "Compétition spatiale", caption: "L'orbite terrestre, nouvel espace stratégique", motif: "sat", tone: "steel" },
];

const W = 280;
const H = 176;

function Art({ motif, c }: { motif: Motif; c: string }) {
  const s = { stroke: c, strokeWidth: 1.4, fill: "none" } as const;
  const f = { fill: c, opacity: 0.85 } as const;
  switch (motif) {
    case "summit":
      return (
        <G>
          <Ellipse cx="140" cy="100" rx="82" ry="22" {...s} />
          <Ellipse cx="140" cy="100" rx="60" ry="14" {...s} opacity={0.5} />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <Circle key={i} cx={140 + Math.cos(a) * 96} cy={100 + Math.sin(a) * 30} r="6" {...f} />;
          })}
          {[70, 140, 210].map((x) => <G key={x}><Line x1={x} y1="30" x2={x} y2="62" {...s} /><Path d={`M${x} 30 L${x + 22} 36 L${x} 44 Z`} {...f} /></G>)}
        </G>
      );
    case "treaty":
      return (
        <G>
          <Rect x="86" y="22" width="108" height="100" {...s} />
          {[40, 52, 64, 76, 88].map((y) => <Line key={y} x1="100" y1={y} x2="180" y2={y} {...s} opacity={0.6} />)}
          <Circle cx="168" cy="106" r="9" {...f} />
          <Path d="M210 30 L150 96" {...s} strokeWidth={2} />
        </G>
      );
    case "plane":
      return (
        <G>
          <Polygon points="60,84 168,76 208,60 214,66 190,82 214,98 208,104 168,92 60,100" {...f} />
          <Polygon points="120,80 150,36 162,38 148,80" {...f} opacity={0.6} />
          <Polygon points="120,96 150,140 162,138 148,96" {...f} opacity={0.6} />
          {[0, 1, 2].map((i) => <Line key={i} x1={30 - i * 4} y1={80 + i * 8} x2={70} y2={80 + i * 8} {...s} opacity={0.4} />)}
        </G>
      );
    case "ship":
      return (
        <G>
          <Path d="M40 100 L240 100 L214 124 L66 124 Z" {...f} />
          <Rect x="150" y="76" width="40" height="24" {...f} opacity={0.7} />
          <Rect x="166" y="60" width="12" height="16" {...f} opacity={0.7} />
          {[0, 1, 2, 3].map((i) => <Rect key={i} x={62 + i * 22} y="86" width="18" height="14" {...f} opacity={0.5} />)}
          {[0, 1, 2].map((i) => <Path key={i} d={`M20 ${132 + i * 10} Q60 ${124 + i * 10} 100 ${132 + i * 10} T180 ${132 + i * 10} T260 ${132 + i * 10}`} {...s} opacity={0.4} />)}
        </G>
      );
    case "tanker":
      return (
        <G>
          <Path d="M24 104 L256 104 L236 126 L44 126 Z" {...f} />
          <Rect x="204" y="72" width="30" height="32" {...f} opacity={0.7} />
          {[0, 1, 2, 3, 4].map((i) => <Ellipse key={i} cx={64 + i * 30} cy="100" rx="12" ry="5" {...f} opacity={0.5} />)}
          <Path d="M0 142 Q70 130 140 142 T280 142" {...s} opacity={0.4} />
          <Line x1="0" y1="52" x2="280" y2="52" stroke={c} strokeWidth="0.6" strokeDasharray="3 5" opacity={0.5} />
        </G>
      );
    case "missile":
      return (
        <G>
          {[16, 30, 44].map((r) => <Circle key={r} cx="196" cy="102" r={r} {...s} opacity={0.5} />)}
          <Polygon points="40,118 150,60 160,70 54,128" {...f} />
          <Polygon points="150,60 176,42 160,70" {...f} />
          <Polygon points="40,118 24,106 36,100 52,112" {...f} opacity={0.6} />
        </G>
      );
    case "wall":
      return (
        <G>
          <Rect x="20" y="64" width="240" height="62" {...s} />
          {[0, 1, 2, 3].map((r) => Array.from({ length: 8 }).map((_, i) => <Rect key={`${r}${i}`} x={20 + i * 30 + (r % 2) * 15} y={64 + r * 15.5} width="30" height="15.5" {...s} opacity={0.45} />))}
          <Path d="M20 50 L260 50" {...s} /><Path d="M20 50 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8" {...s} opacity={0.6} />
        </G>
      );
    case "sat":
      return (
        <G>
          <Path d="M10 150 Q140 60 270 150" {...s} />
          <Path d="M10 150 Q140 40 270 150" {...s} opacity={0.4} strokeDasharray="3 5" />
          <G transform="translate(168,62) rotate(-24)">
            <Rect x="-10" y="-8" width="20" height="16" {...f} />
            <Rect x="-40" y="-5" width="26" height="10" {...f} opacity={0.6} />
            <Rect x="14" y="-5" width="26" height="10" {...f} opacity={0.6} />
          </G>
          {[0, 1, 2, 3, 4].map((i) => <Circle key={i} cx={60 + i * 40} cy={46 + (i % 2) * 14} r="1.5" {...f} />)}
        </G>
      );
    default:
      return (
        <G>
          <Path d="M30 110 Q40 60 90 56 Q120 40 150 60 Q200 54 230 90 Q246 120 200 128 Q150 140 110 128 Q50 134 30 110 Z" {...s} />
          <Path d="M90 56 Q96 90 120 128 M150 60 Q150 96 170 130" {...s} strokeDasharray="4 4" opacity={0.6} />
          <Polygon points="192,76 200,92 184,92" {...f} />
          <Circle cx="108" cy="96" r="3" {...f} />
        </G>
      );
  }
}

function Plate({ p, w }: { p: PlateData; w: number }) {
  const h = (w * H) / W;
  const sepia = p.tone === "sepia";
  const ink = sepia ? "#D9BE8A" : "#9DB7D4";
  const bg1 = sepia ? "#2A2012" : "#0F1B2A";
  const bg2 = sepia ? "#14100A" : "#08111B";
  return (
    <View style={{ width: w, height: h, marginBottom: 22 }}>
      <Svg width={w} height={h} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id={`g${p.title}${p.year}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={bg1} /><Stop offset="1" stopColor={bg2} /></LinearGradient>
          <Pattern id={`n${p.title}${p.year}`} width="4" height="4" patternUnits="userSpaceOnUse"><Rect width="1" height="1" fill={ink} opacity={0.12} /></Pattern>
        </Defs>
        <Rect width={W} height={H} fill={`url(#g${p.title}${p.year})`} />
        <Rect width={W} height={H} fill={`url(#n${p.title}${p.year})`} />
        <Art motif={p.motif} c={ink} />
        <Rect x="0.5" y="0.5" width={W - 1} height={H - 1} stroke={ink} strokeOpacity={0.5} fill="none" />
        <Rect x="0" y={H - 46} width={W} height="46" fill="#000" opacity={0.55} />
        <SvgText x="12" y={H - 28} fill={ink} fontSize="10" fontFamily={F.monoBold} letterSpacing="2">{p.year.toUpperCase()}</SvgText>
        <SvgText x="12" y={H - 12} fill="#EDE6D4" fontSize="14" fontFamily={F.title}>{p.title}</SvgText>
        <SvgText x="12" y={H - 1} fill={ink} fontSize="0" fontFamily={F.sans}>{p.caption}</SvgText>
      </Svg>
    </View>
  );
}

function Column({ plates, w, speed, delay }: { plates: PlateData[]; w: number; speed: number; delay: number }) {
  const reduced = useReducedMotion();
  const y = useRef(new Animated.Value(0)).current;
  const unit = (w * H) / W + 22;
  const total = unit * plates.length;
  useEffect(() => {
    if (reduced) return;
    y.setValue(-total);
    const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: (total / speed) * 1000, easing: Easing.linear, useNativeDriver: true }));
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, [reduced, total, speed, delay]);
  const list = [...plates, ...plates];
  return (
    <View style={{ width: w, overflow: "hidden", height: "100%" as any }}>
      <Animated.View style={{ transform: [{ translateY: reduced ? -total * 0.3 : y }], position: "absolute", top: 0 }}>
        {list.map((p, i) => <Plate key={i} p={p} w={w} />)}
      </Animated.View>
    </View>
  );
}

/** Fond défilant. `strength` règle la visibilité des planches (0.1 discret → 0.5 mis en avant). */
export function Chronicle({ strength = 0.28 }: { strength?: number }) {
  const { width } = useLayout();
  const cols = width < 700 ? 1 : width < 1100 ? 2 : 3;
  const colW = Math.min(300, Math.floor((width - 24 * (cols + 1)) / cols));
  const columns = useMemo(() => {
    const n = PLATES.length;
    return Array.from({ length: cols }).map((_, i) => {
      const rot = Math.floor((n / cols) * i);
      return [...PLATES.slice(rot), ...PLATES.slice(0, rot)].slice(0, 8);
    });
  }, [cols]);
  if (colW < 120) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { flexDirection: "row", justifyContent: "space-evenly", opacity: strength }]} pointerEvents="none">
      {columns.map((pl, i) => <Column key={i} plates={pl} w={colW} speed={9 + i * 4} delay={i * 400} />)}
    </View>
  );
}

/** Voile sombre dégradé par-dessus le fond défilant pour garder les textes lisibles. */
export function ChronicleVeil() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bg} stopOpacity="0.85" />
          <Stop offset="0.35" stopColor={C.bg} stopOpacity="0.35" />
          <Stop offset="1" stopColor={C.bg} stopOpacity="0.9" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#veil)" />
    </Svg>
  );
}
