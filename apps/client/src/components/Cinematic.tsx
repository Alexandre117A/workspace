import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from "react-native-svg";
import { useLayout, useReducedMotion } from "./ui";
import { C, F } from "../theme";

/**
 * Séquence de fin (~10 s) composée à partir de plans vectoriels adaptés au thème
 * (flotte spatiale, aube navale, marine à voile, théâtre terrestre). Interface
 * prête pour un futur générateur vidéo : `CinematicSource` peut fournir une URL
 * de vidéo réelle ; aucune vidéo n'est simulée ou prétendue générée.
 */
export interface CinematicSource {
  theme: string;
  videoUrl?: string | null;
}

const AnimatedG = Animated.createAnimatedComponent(G);
const DURATION = 10000;

function Stars({ w, h, n, seed }: { w: number; h: number; n: number; seed: number }) {
  const pts = useMemo(() => Array.from({ length: n }, (_, i) => {
    const r = Math.sin(seed * 999 + i * 12.9898) * 43758.5453;
    const r2 = Math.sin(seed * 777 + i * 78.233) * 12345.678;
    return { x: (r - Math.floor(r)) * w, y: (r2 - Math.floor(r2)) * h, s: ((i * 7) % 10) / 10 };
  }), [w, h, n, seed]);
  return <>{pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={0.5 + p.s} fill="#DDE6F0" opacity={0.25 + p.s * 0.6} />)}</>;
}

function Ship({ x, y, s, color = "#B9C4CF" }: { x: number; y: number; s: number; color?: string }) {
  return (
    <G transform={`translate(${x},${y}) scale(${s})`}>
      <Polygon points="0,0 120,-6 168,0 120,6" fill="#1A2129" stroke={color} strokeWidth={0.8} />
      <Polygon points="40,-6 92,-14 108,-6" fill="#132337" stroke={color} strokeWidth={0.6} />
      <Polygon points="40,6 92,14 108,6" fill="#132337" stroke={color} strokeWidth={0.6} />
      <Line x1="20" y1="0" x2="150" y2="0" stroke={color} strokeWidth={0.4} opacity={0.6} />
      <Circle cx="-4" cy="0" r="5" fill="#8FC7FF" opacity={0.7} />
      <Circle cx="-10" cy="0" r="9" fill="#8FC7FF" opacity={0.18} />
    </G>
  );
}

function Destroyer({ x, y, s, sail }: { x: number; y: number; s: number; sail?: boolean }) {
  if (sail) {
    return (
      <G transform={`translate(${x},${y}) scale(${s})`}>
        <Path d="M0 0 L120 0 L108 14 L12 14 Z" fill="#0E1114" stroke="#7A6A50" strokeWidth={0.8} />
        <Line x1="40" y1="0" x2="40" y2="-70" stroke="#7A6A50" strokeWidth={1} />
        <Line x1="78" y1="0" x2="78" y2="-60" stroke="#7A6A50" strokeWidth={1} />
        <Path d="M42 -66 Q62 -44 42 -22 Z M80 -56 Q98 -36 80 -16 Z" fill="#C9BB9A" opacity={0.55} />
      </G>
    );
  }
  return (
    <G transform={`translate(${x},${y}) scale(${s})`}>
      <Path d="M0 0 L150 0 L140 10 L14 10 Z" fill="#0E1B2D" stroke="#5E7186" strokeWidth={0.8} />
      <Path d="M50 0 L56 -14 L82 -14 L86 -24 L94 -24 L96 -14 L110 -14 L114 0 Z" fill="#0E1B2D" stroke="#5E7186" strokeWidth={0.8} />
      <Line x1="90" y1="-24" x2="90" y2="-40" stroke="#5E7186" strokeWidth={0.8} />
    </G>
  );
}

export function Cinematic({ source, title, winner, onDone }: { source: CinematicSource; title: string; winner?: string; onDone: () => void }) {
  const { width, height } = useLayout();
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  const [shot, setShot] = useState(0);
  useEffect(() => {
    if (reduced) {
      const id = setTimeout(onDone, 2500);
      return () => clearTimeout(id);
    }
    Animated.timing(t, { toValue: 1, duration: DURATION, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(({ finished }) => finished && onDone());
    const s1 = setTimeout(() => setShot(1), DURATION * 0.48);
    const s2 = setTimeout(() => setShot(2), DURATION * 0.8);
    return () => { clearTimeout(s1); clearTimeout(s2); };
  }, []);
  const w = width;
  const h = height;
  const theme = source.theme;
  const drift = t.interpolate({ inputRange: [0, 1], outputRange: [0, -w * 0.6] });
  const zoom = t.interpolate({ inputRange: [0, 0.48, 0.49, 1], outputRange: [1, 1.12, 1.25, 1.6] });
  const fadeTitle = t.interpolate({ inputRange: [0, 0.78, 0.86, 1], outputRange: [0, 0, 1, 1] });

  const scene = (() => {
    if (theme === "space_fleet") {
      return (
        <Svg width={w} height={h}>
          <Rect width={w} height={h} fill="#020306" />
          <Stars w={w} h={h} n={160} seed={1} />
          <Circle cx={w * 0.82} cy={h * 1.25} r={h * 0.75} fill="#0B1420" stroke="#2E4A66" strokeWidth={1.2} />
          <Circle cx={w * 0.82} cy={h * 1.25} r={h * 0.77} fill="none" stroke="#4E7EA8" strokeWidth={0.6} opacity={0.4} />
          {shot === 0 ? (<><Ship x={w * 0.2} y={h * 0.4} s={1.2} /><Ship x={w * 0.45} y={h * 0.55} s={0.8} /><Ship x={w * 0.62} y={h * 0.34} s={0.55} /></>) : null}
          {shot === 1 ? (<><Ship x={w * 0.25} y={h * 0.5} s={2.4} color="#D9E2EA" /><Ship x={w * 0.6} y={h * 0.3} s={0.9} /></>) : null}
          {shot === 2 ? <Ship x={w * 0.35} y={h * 0.45} s={1.4} /> : null}
        </Svg>
      );
    }
    if (theme === "naval_dawn" || theme === "age_of_sail") {
      const sail = theme === "age_of_sail";
      return (
        <Svg width={w} height={h}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#05080C" />
              <Stop offset="0.75" stopColor={sail ? "#3A2A1A" : "#1D2733"} />
              <Stop offset="1" stopColor={sail ? "#7A5530" : "#5A4A3A"} />
            </LinearGradient>
          </Defs>
          <Rect width={w} height={h * 0.62} fill="url(#sky)" />
          <Rect y={h * 0.62} width={w} height={h * 0.38} fill="#04070A" />
          {Array.from({ length: 22 }).map((_, i) => <Line key={i} x1={0} x2={w} y1={h * 0.62 + i * i * 0.9} y2={h * 0.62 + i * i * 0.9} stroke="#2A3542" strokeWidth={0.5} opacity={0.6 - i * 0.02} />)}
          <Circle cx={w * 0.7} cy={h * 0.6} r={34} fill={sail ? "#E0A35A" : "#C98A5A"} opacity={0.35} />
          {shot === 0 ? (<><Destroyer x={w * 0.2} y={h * 0.6} s={1.3} sail={sail} /><Destroyer x={w * 0.55} y={h * 0.605} s={0.8} sail={sail} /></>) : null}
          {shot === 1 ? <Destroyer x={w * 0.15} y={h * 0.66} s={3} sail={sail} /> : null}
          {shot === 2 ? (<><Destroyer x={w * 0.3} y={h * 0.6} s={1} sail={sail} /><Destroyer x={w * 0.5} y={h * 0.605} s={0.7} sail={sail} /><Destroyer x={w * 0.66} y={h * 0.61} s={0.5} sail={sail} /></>) : null}
        </Svg>
      );
    }
    // Théâtre terrestre : lignes de niveau, front qui progresse, axes d'effort.
    const old = theme === "historic_field";
    return (
      <Svg width={w} height={h}>
        <Rect width={w} height={h} fill={old ? "#0C0A07" : "#05080B"} />
        {Array.from({ length: 16 }).map((_, i) => (
          <Path key={i} d={`M ${-50} ${h * 0.2 + i * 38} Q ${w * 0.3} ${h * 0.1 + i * 40} ${w * 0.6} ${h * 0.25 + i * 36} T ${w + 50} ${h * 0.2 + i * 37}`} stroke={old ? "#4A3E2A" : "#1C2A38"} strokeWidth={0.7} fill="none" />
        ))}
        <Path d={`M ${w * 0.1} ${h * 0.85} C ${w * 0.3} ${h * 0.6}, ${w * 0.45} ${h * 0.7}, ${w * 0.6} ${h * 0.4} S ${w * 0.85} ${h * 0.3}, ${w * 0.95} ${h * 0.15}`} stroke={C.red} strokeWidth={shot === 0 ? 1.5 : 2.4} fill="none" strokeDasharray="8 5" />
        {shot >= 1 ? [0.3, 0.5, 0.7].map((f) => <Path key={f} d={`M ${w * f} ${h * 0.75} L ${w * (f + 0.08)} ${h * 0.5}`} stroke={old ? "#C9A45C" : C.steel} strokeWidth={2} fill="none" />) : null}
        {shot === 2 ? <Rect x={w * 0.2} y={h * 0.2} width={w * 0.6} height={h * 0.6} fill="none" stroke={old ? "#C9A45C" : C.brass} strokeWidth={0.8} opacity={0.6} /> : null}
      </Svg>
    );
  })();

  return (
    <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "#000", overflow: "hidden" }}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: theme === "space_fleet" ? drift : 0 }, { scale: zoom }] }}>{scene}</Animated.View>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: h * 0.1, backgroundColor: "#000" }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h * 0.1, backgroundColor: "#000" }} />
      <Animated.View style={{ position: "absolute", left: 0, right: 0, top: h * 0.38, alignItems: "center", opacity: reduced ? 1 : fadeTitle }}>
        <Text style={{ fontFamily: F.monoBold, letterSpacing: 8, color: C.muted, fontSize: 12 }}>SIMULATION TERMINÉE</Text>
        <Text style={{ fontFamily: F.title, color: C.text, fontSize: Math.min(56, w / 12), textAlign: "center", paddingHorizontal: 20 }}>{title}</Text>
        {winner ? <Text style={{ fontFamily: F.titleItalic, color: C.brass, fontSize: 24, marginTop: 8 }}>{winner}</Text> : null}
      </Animated.View>
      <Pressable accessibilityRole="button" onPress={onDone} style={{ position: "absolute", right: 20, bottom: h * 0.1 + 14, padding: 10 }}>
        <Text style={{ fontFamily: F.monoBold, letterSpacing: 2, color: C.muted, fontSize: 11 }}>PASSER ›</Text>
      </Pressable>
    </View>
  );
}
