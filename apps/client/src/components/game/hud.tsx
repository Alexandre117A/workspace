import { ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";
import { Label, useLayout, useReducedMotion } from "../ui";
import { C, F, S } from "../../theme";

/** Rendu « poste de commandement technologique » des écrans de jeu : cadres à repères d'angle, grille fine, lueur cyan,
 * lecture en chiffres monospaces. La couleur technique (cyan) structure l'interface ; le laiton reste la couleur d'accent historique. */
export const TECH = "#6FD3E8";
export const TECH_DIM = "#1E4D63";

/** Quatre repères d'angle (style viseur) autour d'un cadre. */
export function Brackets({ color = TECH, size = 12, thick = 2, inset = -1 }: { color?: string; size?: number; thick?: number; inset?: number }) {
  const base = { position: "absolute", width: size, height: size, borderColor: color } as const;
  return (
    <>
      <View pointerEvents="none" style={{ ...base, top: inset, left: inset, borderTopWidth: thick, borderLeftWidth: thick }} />
      <View pointerEvents="none" style={{ ...base, top: inset, right: inset, borderTopWidth: thick, borderRightWidth: thick }} />
      <View pointerEvents="none" style={{ ...base, bottom: inset, left: inset, borderBottomWidth: thick, borderLeftWidth: thick }} />
      <View pointerEvents="none" style={{ ...base, bottom: inset, right: inset, borderBottomWidth: thick, borderRightWidth: thick }} />
    </>
  );
}

/** Cadre technique réutilisable (colonnes, cartes) : fond translucide, bord lumineux, repères d'angle. */
export function HudFrame({ children, style, color = TECH, glow = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; color?: string; glow?: boolean }) {
  return (
    <View style={[{ backgroundColor: "#0A1626EE", borderWidth: 1, borderColor: C.lineHi, ...(glow ? ({ boxShadow: `0 0 18px ${color}18, inset 0 0 28px ${color}0A` } as any) : null) }, style]}>
      {children}
      <Brackets color={color} />
    </View>
  );
}

/** Voyant d'état : point lumineux qui pulse doucement (fixe si l'utilisateur réduit les animations). */
export function Led({ color = C.green, size = 8, pulse = true }: { color?: string; size?: number; pulse?: boolean }) {
  const a = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!pulse || reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: a }, ({ boxShadow: `0 0 8px ${color}` } as any)]} />;
}

/** Fond du poste de jeu : grille fine cyan, balayage lent (désactivé si animations réduites), vignette. */
export function Backdrop({ dense = false }: { dense?: boolean; transparent?: boolean }) {
  const y = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const { height } = useLayout();
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(y, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced]);
  const cell = dense ? 40 : 64;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="hudgrid" width={cell} height={cell} patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2={cell} y2="0" stroke={TECH} strokeWidth={0.5} opacity={0.14} />
            <Line x1="0" y1="0" x2="0" y2={cell} stroke={TECH} strokeWidth={0.5} opacity={0.14} />
            <Line x1={cell - 4} y1="0" x2={cell + 4} y2="0" stroke={TECH} strokeWidth={1} opacity={0.35} />
            <Line x1="0" y1={cell - 4} x2="0" y2={cell + 4} stroke={TECH} strokeWidth={1} opacity={0.35} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={C.bg} />
        <Rect width="100%" height="100%" fill="url(#hudgrid)" />
      </Svg>
      {reduced ? null : (
        <Animated.View style={{ position: "absolute", left: 0, right: 0, height: 120, top: -120, opacity: 0.5, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, height + 240] }) }], ...({ backgroundImage: `linear-gradient(to bottom, transparent, ${TECH}14, transparent)` } as any) }} />
      )}
      <View style={[StyleSheet.absoluteFill, ({ boxShadow: "inset 0 0 160px rgba(3,8,15,0.85)" } as any)]} />
    </View>
  );
}

/** Panneau technique : repères d'angle lumineux, en-tête numéroté, filet. Même interface que le panneau standard. */
export function Panel({ children, style, title, accent = C.line, right }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; accent?: string; right?: ReactNode }) {
  const color = accent === C.line ? TECH : accent;
  return (
    <HudFrame color={color} glow={false} style={[{ backgroundColor: "#0C1B2EEE", padding: S(4), gap: S(3) }, style]}>
      {title ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 4, height: 12, backgroundColor: color, ...({ boxShadow: `0 0 8px ${color}` } as any) }} />
          <Label color={color} style={{ flexShrink: 1 }}>{title}</Label>
          <View style={{ flex: 1, height: 1, backgroundColor: `${color}33` }} />
          {right}
        </View>
      ) : null}
      {children}
    </HudFrame>
  );
}

/** Jauge segmentée lumineuse (20 segments) : lecture instantanée d'un niveau sur 100. */
export function Bar({ value, max = 100, color = TECH, height = 6 }: { value: number; max?: number; color?: string; height?: number }) {
  const n = 20;
  const lit = Math.round(Math.max(0, Math.min(1, value / max)) * n);
  return (
    <View style={{ flexDirection: "row", gap: 2, width: "100%" }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: Math.round(value) }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ flex: 1, height: Math.max(height, 5), backgroundColor: i < lit ? color : C.line, opacity: i < lit ? 1 : 0.55, ...(i < lit ? ({ boxShadow: `0 0 6px ${color}66` } as any) : null) }} />
      ))}
    </View>
  );
}

/** Fenêtre modale de poste de commandement. */
export function Sheet({ visible, onClose, title, children, accent = TECH, wide }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; accent?: string; wide?: boolean }) {
  const { phone } = useLayout();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(3,8,15,0.88)", justifyContent: phone ? "flex-end" : "center", alignItems: "center", padding: phone ? 0 : 24 }}>
        <HudFrame color={accent} style={{ width: "100%", maxWidth: wide ? 1100 : 760, maxHeight: phone ? "92%" : "90%", backgroundColor: "#091525" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S(4), paddingVertical: S(3), borderBottomWidth: 1, borderBottomColor: `${accent}44`, gap: 10 }}>
            <Led color={accent} size={7} />
            <Label color={accent} style={{ flex: 1 }}>{title}</Label>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${accent}55` }}>
              <Text style={{ color: accent, fontSize: 20, fontFamily: F.mono }}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: S(4), gap: S(4) }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </HudFrame>
      </View>
    </Modal>
  );
}
