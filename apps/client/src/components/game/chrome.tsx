import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { PHASE_LABELS } from "@geonex/shared";
import { Emblem } from "../Brand";
import { Label, useLayout, useReducedMotion } from "../ui";
import { Brackets, Led, TECH } from "./hud";
import { fmtClock, remaining, useNow } from "../../lib/game";
import { C, F, S } from "../../theme";

/** Barre supérieure : phase, chronomètre serveur, temps simulé, état de connexion. */
export function TopBar({ title, runtime, offset, simTime, connected, right, strip }: { title: string; runtime: any; offset: number; simTime?: string; connected: boolean; right?: React.ReactNode; strip?: React.ReactNode }) {
  const now = useNow(250);
  const { phone } = useLayout();
  const left = runtime?.paused ? runtime.pausedRemainingMs : remaining(runtime?.phaseDeadline, offset, now);
  const total = runtime?.endsAt ? remaining(runtime.endsAt, offset, now) : null;
  return (
    <View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S(4), paddingVertical: S(2), borderBottomWidth: 1, borderBottomColor: `${TECH}55`, backgroundColor: "#07111FF2", gap: S(3), ...({ boxShadow: `0 1px 14px ${TECH}22` } as any) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S(3), flex: 1 }}>
        <Emblem size={phone ? 24 : 28} />
        {!phone ? <Text numberOfLines={1} style={{ fontFamily: F.title, color: C.text, fontSize: 18, flexShrink: 1 }}>{title}</Text> : null}
      </View>
      <View style={{ alignItems: "center" }}>
        <Label color={runtime?.paused ? C.amber : TECH}>{runtime?.paused ? "Séance suspendue" : PHASE_LABELS[runtime?.phase as keyof typeof PHASE_LABELS] ?? "—"}</Label>
        <Text accessibilityLabel="Temps restant pour la phase" style={{ fontFamily: F.monoBold, fontSize: phone ? 22 : 26, letterSpacing: 2, color: left !== null && left < 15000 && !runtime?.paused ? C.red : C.text, ...({ textShadow: `0 0 12px ${left !== null && left < 15000 && !runtime?.paused ? C.red : TECH}88` } as any) }}>{fmtClock(left)}</Text>
      </View>
      <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
        {simTime && !phone && !strip ? <Label color={C.muted}>{simTime}</Label> : null}
        <View style={{ flexDirection: "row", gap: S(3), alignItems: "center" }}>
          {total !== null && !phone ? <Label color={C.faint}>Fin ≈ {fmtClock(total)}</Label> : null}
          <View accessibilityLabel={connected ? "Connecté" : "Reconnexion"} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Led color={connected ? C.green : C.red} />{!phone ? <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.6, color: connected ? C.green : C.red }}>{connected ? "LIVE" : "SYNC…"}</Text> : null}</View>
          {!phone ? right : null}
        </View>
      </View>
    </View>
    {phone && right ? <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: S(4), paddingHorizontal: S(4), paddingVertical: 4, backgroundColor: "#07111FF2", borderBottomWidth: 1, borderBottomColor: `${TECH}33` }}>{right}</View> : null}
    {strip}
    </View>
  );
}

/** Petite carte d'accès (coins inférieurs) : même gabarit, codes visuels distincts. */
export function AccessCard({ label, value, sub, color, onPress, locked, compact }: { label: string; value?: string; sub?: string; color: string; onPress: () => void; locked?: boolean; compact?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ hovered, pressed }: any) => ({
        width: compact ? undefined : 156, flex: compact ? 1 : undefined, minHeight: compact ? 64 : 92, backgroundColor: pressed ? C.panelHi : "#08121FEE",
        borderWidth: 1, borderColor: hovered ? color : C.lineHi, padding: compact ? S(2) : S(3), justifyContent: "space-between",
        ...(hovered && !locked ? ({ boxShadow: `0 0 14px ${color}44` } as any) : null),
      })}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: locked ? C.line : color }} />
      <Brackets color={locked ? C.lineHi : color} size={8} thick={1} />
      <Text style={{ fontFamily: F.monoBold, fontSize: compact ? 9 : 10, letterSpacing: 1.6, color: locked ? C.faint : color, textTransform: "uppercase" }} numberOfLines={1}>{label}</Text>
      {value ? <Text style={{ fontFamily: F.title, fontSize: compact ? 18 : 24, color: locked ? C.faint : C.text }} numberOfLines={1}>{locked ? "🔒" : value}</Text> : null}
      {sub && !compact ? <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }} numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
}

export function RoundMark({ round }: { round: number }) {
  round = Math.max(1, round);
  return <Text accessibilityLabel={`Round ${round}`} style={{ fontFamily: F.monoBold, fontSize: 13, letterSpacing: 4, color: C.muted }}>ROUND {round}</Text>;
}

/** Annonce du dernier round : immersive, ne bloque pas les actions. */
export function LastRoundBanner({ data, onDone }: { data: { message: string } | null; onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!data) return;
    a.setValue(0);
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: reduced ? 1 : 500, useNativeDriver: true }),
      Animated.delay(5200),
      Animated.timing(a, { toValue: 0, duration: reduced ? 1 : 600, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, [data]);
  if (!data) return null;
  return (
    <Animated.View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: "30%", alignItems: "center", opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }] }}>
      <Pressable onPress={onDone} style={{ backgroundColor: "#0A0503F0", borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.red, paddingVertical: S(6), paddingHorizontal: S(10), alignItems: "center", gap: S(2), width: "100%" }}>
        <Text style={{ fontFamily: F.monoBold, letterSpacing: 10, fontSize: 30, color: C.red }}>DERNIER ROUND</Text>
        <Text style={{ fontFamily: F.titleItalic, fontSize: 22, color: C.text, textAlign: "center" }}>{data.message}</Text>
      </Pressable>
    </Animated.View>
  );
}
