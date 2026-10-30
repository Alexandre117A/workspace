import { ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { C, F, S } from "../theme";
import { PROVENANCE, Provenance } from "./provenance";

/** Pastille de provenance : distingue donnée attestée, estimation, hypothèse, valeur fictive, valeur de simulation, donnée absente. */
export function ProvenanceChip({ status, compact = false, light = false }: { status: Provenance; compact?: boolean; light?: boolean }) {
  const p = PROVENANCE[status];
  const color = light ? ({ confirmed: "#2F6B37", estimate: "#8A5A0C", hypothesis: "#2F5E8E", fiction: "#7A5F20", simulation: "#2F5E8E", unknown: "#6B6A66" } as Record<string, string>)[status] : p.color;
  return (
    <View accessible accessibilityLabel={`${p.label} : ${p.hint}`} style={{ borderWidth: 1, borderColor: color, paddingHorizontal: compact ? 4 : 6, paddingVertical: compact ? 0 : 1, alignSelf: "flex-start" }}>
      <Text style={{ color, fontFamily: F.monoBold, fontSize: compact ? 8.5 : 9.5, letterSpacing: 1.1, textTransform: "uppercase" }}>{p.label}</Text>
    </View>
  );
}

/** Évolution depuis le round précédent. `invert` : une hausse est une mauvaise nouvelle (tension, lassitude). */
export function Delta({ value, invert = false }: { value: number | null | undefined; invert?: boolean }) {
  if (value == null || value === 0) return null;
  const good = invert ? value < 0 : value > 0;
  return <Text accessibilityLabel={`${value > 0 ? "hausse" : "baisse"} de ${Math.abs(value)} depuis le round précédent`} style={{ fontFamily: F.monoBold, fontSize: 10.5, color: good ? C.green : C.red }}>{value > 0 ? "▲" : "▼"} {Math.abs(value)}</Text>;
}

/** Panneau de l'atlas : `navy` (bleu marine) ou `ivory` (surface éditoriale claire), avec filet d'accent. */
export function AtlasPanel({ title, kicker, tone = "navy", accent = C.brass, children, right, collapsible = false, defaultOpen = true }: {
  title: string; kicker?: string; tone?: "navy" | "ivory"; accent?: string; children: ReactNode; right?: ReactNode; collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ivory = tone === "ivory";
  const head = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {kicker ? <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2, color: accent, textTransform: "uppercase" }}>{kicker}</Text> : null}
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: 19, color: ivory ? C.ink : C.text }}>{title}</Text>
      </View>
      {right}
      {collapsible ? <Text style={{ fontFamily: F.monoBold, fontSize: 14, color: ivory ? C.inkSoft : C.muted }}>{open ? "−" : "+"}</Text> : null}
    </View>
  );
  return (
    <View style={{ backgroundColor: ivory ? "#F3F0E9" : C.panel, borderWidth: 1, borderColor: ivory ? "#D7CFBA" : C.lineHi, borderTopWidth: 2, borderTopColor: accent, padding: S(4), gap: S(3) }}>
      {collapsible ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title} : ${open ? "replier" : "déplier"}`} onPress={() => setOpen(!open)}>{head}</Pressable> : head}
      {open ? children : null}
    </View>
  );
}

export function Kicker({ children, color = C.muted }: { children: ReactNode; color?: string }) {
  return <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2, color, textTransform: "uppercase" }}>{children}</Text>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint, fontStyle: "italic" }}>{children}</Text>;
}
