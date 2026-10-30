import { ReactNode, useEffect, useState } from "react";
import {
  AccessibilityInfo, ActivityIndicator, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, useWindowDimensions,
  View, ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";
import { C, F, S } from "../theme";
import { Chronicle, ChronicleVeil } from "./Chronicle";

export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, phone: width < 700, tablet: width >= 700 && width < 1100, desktop: width >= 1100 };
}

/** Préférence d'accessibilité « réduire les animations ». */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub?.remove?.();
  }, []);
  return reduced;
}

/** Fond commun : grille de coordonnées très fine, cadre de poste de commandement. */
export function Backdrop({ dense = false }: { dense?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="grid" width={dense ? 32 : 64} height={dense ? 32 : 64} patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2={dense ? 32 : 64} y2="0" stroke={C.line} strokeWidth={0.5} opacity={0.5} />
            <Line x1="0" y1="0" x2="0" y2={dense ? 32 : 64} stroke={C.line} strokeWidth={0.5} opacity={0.5} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={C.bg} />
        <Rect width="100%" height="100%" fill="url(#grid)" />
      </Svg>
    </View>
  );
}

export function Screen({ children, scroll = true, style, max = 1180, chronicle = 0.3 }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle>; max?: number; chronicle?: number }) {
  const body = <View style={[{ width: "100%", maxWidth: max, alignSelf: "center", paddingHorizontal: S(4), paddingVertical: S(5) }, style]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      {chronicle > 0 ? <><Chronicle strength={chronicle} /><ChronicleVeil /></> : null}
      <SafeAreaView style={{ flex: 1 }}>
        {scroll ? <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
      </SafeAreaView>
    </View>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text accessibilityRole="header" style={[{ fontFamily: F.title, fontSize: 40, color: C.text, letterSpacing: 0.4, lineHeight: 44 }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text accessibilityRole="header" style={[{ fontFamily: F.title, fontSize: 26, color: C.text, lineHeight: 30 }, style]}>{children}</Text>;
}
export function Label({ children, style, color = C.muted }: { children: ReactNode; style?: StyleProp<TextStyle>; color?: string }) {
  return <Text style={[{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.2, color, textTransform: "uppercase" }, style]}>{children}</Text>;
}
export function Body({ children, style, muted, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[{ fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: muted ? C.muted : C.text }, style]}>{children}</Text>;
}
export function Mono({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: F.mono, fontSize: 13, color: C.text }, style]}>{children}</Text>;
}

type BtnVariant = "primary" | "ghost" | "danger" | "quiet";
export function Btn({ label, onPress, variant = "primary", disabled, busy, style, small, accent }: {
  label: string; onPress?: () => void; variant?: BtnVariant; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; small?: boolean; accent?: string;
}) {
  const color = accent ?? (variant === "danger" ? C.red : C.brass);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        {
          borderWidth: 1, borderColor: variant === "quiet" ? "transparent" : color, paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 12 : 20,
          backgroundColor: variant === "primary" ? (pressed ? color : hovered ? `${color}33` : `${color}1F`) : variant === "danger" ? `${C.red}22` : hovered ? "#ffffff0A" : "transparent",
          opacity: disabled ? 0.4 : 1, alignItems: "center", justifyContent: "center", minHeight: small ? 36 : 46, flexDirection: "row", gap: 8,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : null}
      <Text style={{ fontFamily: F.monoBold, fontSize: small ? 11 : 12.5, letterSpacing: 1.8, color: variant === "quiet" ? C.muted : C.text, textTransform: "uppercase" }}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string; hint?: string; big?: boolean }) {
  const { label, hint, big, style, ...rest } = props;
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={C.faint}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        multiline={big}
        textAlignVertical={big ? "top" : "center"}
        style={[{
          fontFamily: big ? F.sans : F.sansMed, fontSize: big ? 17 : 16, lineHeight: big ? 26 : undefined, color: C.text, backgroundColor: C.panel,
          borderWidth: 1, borderColor: focus ? C.brass : C.line, paddingHorizontal: 14, paddingVertical: 12, minHeight: big ? 200 : 48,
          ...({ outlineStyle: "none" } as any),
        }, style]}
        {...rest}
      />
      {hint ? <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>{hint}</Text> : null}
    </View>
  );
}

export function Panel({ children, style, title, accent = C.line, right }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; accent?: string; right?: ReactNode }) {
  return (
    <View style={[{ backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: S(4), gap: S(3) }, style]}>
      <View style={{ position: "absolute", top: -1, left: -1, width: 14, height: 14, borderTopWidth: 2, borderLeftWidth: 2, borderColor: accent }} />
      <View style={{ position: "absolute", bottom: -1, right: -1, width: 14, height: 14, borderBottomWidth: 2, borderRightWidth: 2, borderColor: accent }} />
      {title ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Label color={accent === C.line ? C.muted : accent}>{title}</Label>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Chip({ label, active, onPress, color = C.brass }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress}
      style={{ borderWidth: 1, borderColor: active ? color : C.line, backgroundColor: active ? `${color}26` : C.panel, paddingHorizontal: 12, paddingVertical: 8, minHeight: 38, justifyContent: "center" }}>
      <Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: active ? C.text : C.muted }}>{label}</Text>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, suffix, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, alignSelf: "flex-start" }}>
        <Pressable accessibilityLabel="Diminuer" onPress={() => onChange(Math.max(min, value - step))} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: value <= min ? C.faint : C.text, fontSize: 22, fontFamily: F.sans }}>−</Text>
        </Pressable>
        <Text style={{ fontFamily: F.monoBold, color: C.text, fontSize: 18, minWidth: 92, textAlign: "center" }}>{value}{suffix ? ` ${suffix}` : ""}</Text>
        <Pressable accessibilityLabel="Augmenter" onPress={() => onChange(Math.min(max, value + step))} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: value >= max ? C.faint : C.text, fontSize: 22, fontFamily: F.sans }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "error" | "ok" }) {
  const color = { info: C.steel, warn: C.amber, error: C.red, ok: C.green }[tone];
  return (
    <View accessibilityRole={tone === "error" ? "alert" : undefined} style={{ borderLeftWidth: 2, borderLeftColor: color, backgroundColor: `${color}14`, paddingVertical: 10, paddingHorizontal: 14 }}>
      <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: C.text }}>{children}</Text>
    </View>
  );
}

export function Loading({ label = "Chargement" }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
      <ActivityIndicator color={C.brass} />
      <Label>{label}</Label>
    </View>
  );
}

export function Sheet({ visible, onClose, title, children, accent = C.brass, wide }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; accent?: string; wide?: boolean }) {
  const { phone } = useLayout();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.overlay, justifyContent: phone ? "flex-end" : "center", alignItems: "center", padding: phone ? 0 : 24 }}>
        <View style={{ width: "100%", maxWidth: wide ? 1100 : 760, maxHeight: phone ? "92%" : "90%", backgroundColor: C.bg2, borderWidth: 1, borderColor: C.lineHi, borderTopColor: accent, borderTopWidth: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S(4), paddingVertical: S(3), borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Label color={accent}>{title}</Label>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={{ padding: 8, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: C.muted, fontSize: 22 }}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: S(4), gap: S(4) }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Bar({ value, max = 100, color = C.brass, height = 6 }: { value: number; max?: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View style={{ height, backgroundColor: C.line, width: "100%" }}>
      <View style={{ height, width: `${pct * 100}%`, backgroundColor: color }} />
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.line, marginVertical: S(1) }} />;
}

export const statusLabel: Record<string, string> = { confirmed: "Fait confirmé", estimate: "Estimation", hypothesis: "Hypothèse du moteur", fiction: "Fiction" };
