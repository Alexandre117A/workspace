import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { C } from "../theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface Series {
  values: number[];
  color: string;
}

function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/** Courbe lissée qui se dessine au chargement (une ou plusieurs séries). */
export function Curve({ series, width, height, min = 0, max = 100, grid = true, fill = true, duration = 1400 }: { series: Series[]; width: number; height: number; min?: number; max?: number; grid?: boolean; fill?: boolean; duration?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const key = JSON.stringify(series.map((s) => s.values));
  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [key]);
  const pad = 6;
  const paths = useMemo(
    () => series.map((s) => {
      const n = s.values.length;
      const pts: [number, number][] = s.values.map((v, i) => [pad + (n === 1 ? 0.5 : i / (n - 1)) * (width - 2 * pad), height - pad - ((v - min) / (max - min || 1)) * (height - 2 * pad)]);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const line = smooth(pts);
      return { line, area: pts.length > 1 ? `${line} L ${pts[pts.length - 1][0]} ${height} L ${pts[0][0]} ${height} Z` : "", len: Math.max(len * 1.2, 10), last: pts[pts.length - 1], color: s.color };
    }),
    [key, width, height, min, max],
  );
  return (
    <Svg width={width} height={height}>
      <Defs>
        {paths.map((p, i) => (
          <LinearGradient key={i} id={`area${i}${p.color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={p.color} stopOpacity="0.28" /><Stop offset="1" stopColor={p.color} stopOpacity="0" /></LinearGradient>
        ))}
      </Defs>
      {grid ? [0.25, 0.5, 0.75].map((f) => <Line key={f} x1="0" x2={width} y1={height * f} y2={height * f} stroke={C.line} strokeWidth={0.6} strokeDasharray="3 5" />) : null}
      {paths.map((p, i) => (
        <AnimatedPath key={`a${i}`} d={fill ? p.area : ""} fill={`url(#area${i}${p.color.replace("#", "")})`} opacity={t as any} />
      ))}
      {paths.map((p, i) => (
        <AnimatedPath key={`l${i}`} d={p.line} stroke={p.color} strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray={`${p.len}`} strokeDashoffset={t.interpolate({ inputRange: [0, 1], outputRange: [p.len, 0] }) as any} />
      ))}
      {paths.map((p, i) => (p.last ? <Circle key={`c${i}`} cx={p.last[0]} cy={p.last[1]} r={3.2} fill={p.color} /> : null))}
    </Svg>
  );
}
