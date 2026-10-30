import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import Svg, { Circle, Ellipse, Line, Path } from "react-native-svg";
import { useLayout, useReducedMotion } from "./ui";
import { C, F } from "../theme";

const ACircle = Animated.createAnimatedComponent(Circle);
const AEllipse = Animated.createAnimatedComponent(Ellipse);
let played = false;

/** Ouverture animée (≈4 s) : le globe se trace, les méridiens apparaissent, puis le nom GEONEX. Une seule fois par visite. */
export function Intro({ onDone }: { onDone: () => void }) {
  const { width, height } = useLayout();
  const reduced = useReducedMotion();
  const [show, setShow] = useState(!played);
  const draw = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const tag = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  const finish = () => {
    played = true;
    setShow(false);
    onDone();
  };

  useEffect(() => {
    if (!show) return onDone();
    if (reduced) {
      const t = setTimeout(finish, 600);
      return () => clearTimeout(t);
    }
    Animated.sequence([
      Animated.timing(draw, { toValue: 1, duration: 1700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(word, { toValue: 1, duration: 700, useNativeDriver: false }),
      Animated.timing(tag, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.delay(700),
      Animated.timing(out, { toValue: 0, duration: 650, useNativeDriver: false }),
    ]).start(({ finished }) => finished && finish());
  }, []);

  if (!show) return null;
  const size = Math.min(width, height) * 0.42;
  const dash = draw.interpolate({ inputRange: [0, 1], outputRange: [560, 0] });
  const spacing = word.interpolate({ inputRange: [0, 1], outputRange: [18, 10] });
  return (
    <Animated.View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,13,18,0.5)", alignItems: "center", justifyContent: "center", opacity: out, zIndex: 50 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <ACircle cx="50" cy="50" r="44" stroke={C.brass} strokeWidth="1.6" fill="none" strokeDasharray="560" strokeDashoffset={dash as any} />
        <AEllipse cx="50" cy="50" rx="18" ry="44" stroke={C.brass} strokeWidth="0.9" fill="none" strokeDasharray="560" strokeDashoffset={dash as any} opacity={0.8} />
        <AEllipse cx="50" cy="50" rx="32" ry="44" stroke={C.brass} strokeWidth="0.6" fill="none" strokeDasharray="560" strokeDashoffset={dash as any} opacity={0.5} />
        <Line x1="6" y1="50" x2="94" y2="50" stroke={C.brass} strokeWidth="0.8" opacity={0.7} />
        <Path d="M12 30 Q50 40 88 30 M12 70 Q50 60 88 70" stroke={C.brass} strokeWidth="0.7" fill="none" opacity={0.45} />
        <Path d="M28 22 L66 46 L40 76 Z" stroke={C.red} strokeWidth="1.4" fill="none" />
        <Circle cx="28" cy="22" r="3.2" fill={C.red} />
        <Circle cx="66" cy="46" r="3.2" fill={C.red} />
        <Circle cx="40" cy="76" r="3.2" fill={C.red} />
      </Svg>
      <Animated.Text style={{ marginTop: 28, fontFamily: F.monoBold, fontSize: Math.min(44, width / 9), color: C.text, letterSpacing: spacing as any, opacity: word }}>GEONEX</Animated.Text>
      <Animated.View style={{ opacity: tag, marginTop: 14, alignItems: "center", gap: 4 }}>
        <Text style={{ fontFamily: F.titleItalic, fontSize: 20, color: C.muted }}>Les rapports de force. Les décisions. Les conséquences.</Text>
      </Animated.View>
      <Pressable accessibilityRole="button" onPress={finish} style={{ position: "absolute", right: 24, bottom: 28, padding: 10 }}>
        <Text style={{ fontFamily: F.monoBold, letterSpacing: 2, fontSize: 11, color: C.faint }}>PASSER ›</Text>
      </Pressable>
    </Animated.View>
  );
}
