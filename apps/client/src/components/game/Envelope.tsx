import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Path, Polygon, Rect } from "react-native-svg";
import { useLayout, useReducedMotion } from "../ui";
import { C, F, S } from "../../theme";

const PAPER = { contemporary: "#EDE6D4", historical: "#E8D9B5", space: "#DCE3E6", fantasy: "#E5D4AE" };

function paperFor(mode: string, era: string) {
  if (era === "space") return { bg: PAPER.space, ink: "#132027", accent: "#2C5566", seal: "#2C5566" };
  if (mode === "historical" || ["medieval", "napoleonic", "early_modern", "ancient", "fantasy"].includes(era)) return { bg: PAPER.historical, ink: "#2A1F12", accent: "#7A2E1E", seal: "#8A2A1C" };
  return { bg: PAPER.contemporary, ink: C.ink, accent: "#7B1F1F", seal: "#7B1F1F" };
}

/** Enveloppe à ouvrir du doigt ou de la souris ; le document en sort puis passe au premier plan. */
export function EnvelopeReveal({ visible, label, stamp, urgent, mode = "contemporary", era = "contemporary", onOpened, children, footer }: {
  visible: boolean; label: string; stamp: string; urgent?: boolean; mode?: string; era?: string; onOpened?: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const { width, height, phone } = useLayout();
  const reduced = useReducedMotion();
  const [opened, setOpened] = useState(false);
  const flap = useRef(new Animated.Value(0)).current;
  const doc = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const paper = paperFor(mode, era);
  const envW = Math.min(width - 40, 520);
  const envH = envW * 0.62;
  const envColor = urgent ? "#2A1210" : era === "space" ? "#1A2830" : mode === "historical" ? "#5B4A30" : "#3A3226";

  useEffect(() => {
    if (!visible) return;
    setOpened(false);
    flap.setValue(0);
    doc.setValue(0);
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: reduced ? 1 : urgent ? 260 : 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible]);

  const open = () => {
    if (opened) return;
    setOpened(true);
    onOpened?.();
    if (reduced) {
      flap.setValue(1);
      doc.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(flap, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(doc, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  const flapRot = flap.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const docY = doc.interpolate({ inputRange: [0, 0.5, 1], outputRange: [envH * 0.3, -envH * 0.55, 0] });
  const docScale = doc.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 0.78, 1] });
  const envDim = doc.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => undefined}>
      <Animated.View style={{ flex: 1, backgroundColor: urgent ? "rgba(18,4,4,0.93)" : C.overlay, alignItems: "center", justifyContent: "center", opacity: appear }}>
        {/* Enveloppe : reste derrière, assombrie, une fois le document sorti. */}
        <Animated.View style={{ position: "absolute", opacity: envDim, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ouvrir l'enveloppe : ${label}`} onPress={open} disabled={opened}>
            <View style={{ width: envW, height: envH }}>
              <Svg width={envW} height={envH}>
                <Rect x={0} y={0} width={envW} height={envH} fill={envColor} stroke={urgent ? C.red : C.brassDim} strokeWidth={1.5} />
                <Polygon points={`0,${envH} ${envW / 2},${envH * 0.48} ${envW},${envH}`} fill={urgent ? "#331614" : "#00000033"} />
                <Path d={`M0 0 L${envW / 2} ${envH * 0.52} L${envW} 0`} stroke={urgent ? C.red : C.brassDim} strokeWidth={1} fill="none" opacity={0.6} />
              </Svg>
              <Animated.View style={{ position: "absolute", top: 0, left: 0, width: envW, height: envH * 0.55, transform: [{ perspective: 800 }, { translateY: -envH * 0.275 }, { rotateX: flapRot }, { translateY: envH * 0.275 }] }}>
                <Svg width={envW} height={envH * 0.55}><Polygon points={`0,0 ${envW},0 ${envW / 2},${envH * 0.55}`} fill={urgent ? "#3A1714" : "#4A402F"} stroke={urgent ? C.red : C.brassDim} strokeWidth={1} /></Svg>
              </Animated.View>
              <View style={{ position: "absolute", left: 0, right: 0, top: envH * 0.36, alignItems: "center" }}>
                <View style={{ borderWidth: 2, borderColor: urgent ? "#E0483C" : paper.seal, paddingHorizontal: 14, paddingVertical: 6, transform: [{ rotate: "-5deg" }], backgroundColor: urgent ? "#00000055" : "transparent" }}>
                  <Text style={{ fontFamily: F.monoBold, letterSpacing: 5, fontSize: urgent ? 26 : 15, color: urgent ? "#F06358" : "#D9A49B" }}>{stamp}</Text>
                </View>
              </View>
              <Text style={{ position: "absolute", bottom: 12, left: 16, right: 16, textAlign: "center", fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: urgent ? "#E9B3AC" : C.paperDim }}>{label}</Text>
            </View>
            {!opened ? <Text style={{ textAlign: "center", marginTop: S(4), color: urgent ? "#F2A39C" : C.muted, fontFamily: F.monoBold, letterSpacing: 2, fontSize: 11 }}>TOUCHEZ L'ENVELOPPE POUR L'OUVRIR</Text> : null}
          </Pressable>
        </Animated.View>

        {opened ? (
          <Animated.View style={{ width: Math.min(width - (phone ? 16 : 48), 720), maxHeight: height * (phone ? 0.9 : 0.86), transform: [{ translateY: docY }, { scale: docScale }], opacity: doc.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }) }}>
            <View style={{ backgroundColor: paper.bg, borderWidth: 1, borderColor: "#00000033", shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 30, elevation: 12 }}>
              <View style={{ height: 6, backgroundColor: paper.accent }} />
              <ScrollView style={{ maxHeight: height * (phone ? 0.9 : 0.86) - (footer ? 96 : 12) }} contentContainerStyle={{ padding: phone ? S(5) : S(8), gap: S(4) }}>
                <PaperContext.Provider value={paper}>{children}</PaperContext.Provider>
              </ScrollView>
              {footer ? <View style={{ padding: S(4), borderTopWidth: 1, borderTopColor: "#00000022" }}>{footer}</View> : null}
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const PaperContext = createContext(paperFor("contemporary", "contemporary"));
export const usePaper = () => useContext(PaperContext);

export function DocTitle({ children }: { children: ReactNode }) {
  const p = usePaper();
  return <Text style={{ fontFamily: F.title, fontSize: 30, lineHeight: 34, color: p.ink }}>{children}</Text>;
}
export function DocLabel({ children }: { children: ReactNode }) {
  const p = usePaper();
  return <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.2, color: p.accent, textTransform: "uppercase" }}>{children}</Text>;
}
export function DocText({ children, small }: { children: ReactNode; small?: boolean }) {
  const p = usePaper();
  return <Text style={{ fontFamily: F.sans, fontSize: small ? 13 : 15, lineHeight: small ? 19 : 22, color: p.ink }}>{children}</Text>;
}
export function DocRule() {
  const p = usePaper();
  return <View style={{ height: 1, backgroundColor: p.ink, opacity: 0.18 }} />;
}
