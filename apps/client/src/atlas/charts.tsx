import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { C, F } from "../theme";
import { Delta, ProvenanceChip } from "./parts";
import { Provenance } from "./provenance";

export interface Series { label: string; color: string; points: { x: number; y: number }[] }

/** Courbe d'évolution : l'axe vertical est borné (0–100 par défaut) ; moins de deux points, rien n'est tracé. */
export function LineChart({ series, width, height = 130, yMax = 100, xLabel = "Round" }: { series: Series[]; width: number; height?: number; yMax?: number; xLabel?: string }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2 || series.every((s) => s.points.length < 2)) return null;
  const x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x));
  const L = 28, R = 8, T = 8, B = 20;
  const sx = (x: number) => L + ((x - x0) / Math.max(1, x1 - x0)) * (width - L - R);
  const sy = (y: number) => T + (1 - Math.min(yMax, Math.max(0, y)) / yMax) * (height - T - B);
  const xs = Array.from(new Set(all.map((p) => p.x))).sort((a, b) => a - b);
  return (
    <View accessible accessibilityLabel={`Évolution : ${series.map((s) => `${s.label} de ${s.points[0].y} à ${s.points[s.points.length - 1].y}`).join(" ; ")}`}>
      <Svg width={width} height={height}>
        {[0, 25, 50, 75, 100].filter((g) => g <= yMax).map((g) => (
          <G key={g}>
            <Line x1={L} x2={width - R} y1={sy(g)} y2={sy(g)} stroke={C.line} strokeWidth={1} />
            <SvgText x={L - 5} y={sy(g) + 3} fontSize={8.5} fontFamily={F.mono} fill={C.faint} textAnchor="end">{g}</SvgText>
          </G>
        ))}
        {xs.map((x) => <SvgText key={x} x={sx(x)} y={height - 5} fontSize={8.5} fontFamily={F.mono} fill={C.faint} textAnchor="middle">{x}</SvgText>)}
        {series.map((s) => (
          <G key={s.label}>
            <Path d={s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x)},${sy(p.y)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {s.points.map((p) => <Circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill={s.color} />)}
          </G>
        ))}
      </Svg>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.faint, textAlign: "right" }}>{xLabel}</Text>
    </View>
  );
}

/** Répartition proportionnelle (parts qui totalisent 100). */
export function StackBar({ parts, height = 14 }: { parts: { label: string; value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <View style={{ gap: 6 }}>
      <View accessible accessibilityLabel={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)} %`).join(", ")} style={{ flexDirection: "row", height, backgroundColor: C.line }}>
        {parts.map((p) => <View key={p.label} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 8, height: 8, backgroundColor: p.color }} />
            <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>{p.label} <Text style={{ fontFamily: F.monoBold, color: C.text }}>{Math.round((p.value / total) * 100)} %</Text></Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Barre horizontale d'un indicateur : valeur courante, repère de départ, évolution et provenance. */
export function HBar({ label, value, max = 100, base, color = C.steel, delta, invert, status, sub, unit = "" }: {
  label: string; value: number; max?: number; base?: number | null; color?: string; delta?: number | null; invert?: boolean; status?: Provenance; sub?: string; unit?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label} : ${Math.round(value)}${unit} sur ${max}${base != null ? `, au départ ${Math.round(base)}` : ""}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: F.sansMed, fontSize: 13, color: C.text, flexShrink: 1 }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Delta value={delta} invert={invert} />
          <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: C.text }}>{Math.round(value)}{unit}</Text>
        </View>
      </View>
      <View style={{ height: 6, backgroundColor: C.line }}>
        <View style={{ width: `${pct}%`, height: 6, backgroundColor: color }} />
        {base != null ? <View style={{ position: "absolute", left: `${Math.min(100, Math.max(0, (base / max) * 100))}%`, top: -2, width: 2, height: 10, backgroundColor: C.text, opacity: 0.8 }} /> : null}
      </View>
      {sub || status ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {sub ? <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{sub}</Text> : null}
          {status ? <ProvenanceChip status={status} compact /> : null}
        </View>
      ) : null}
    </View>
  );
}
