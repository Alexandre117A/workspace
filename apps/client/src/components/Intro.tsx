import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useLayout, useReducedMotion } from "./ui";
import { C, F } from "../theme";

let played = false;

/** Ouverture animée (≈4 s) : le logo apparaît, puis le nom GEONEX. Une seule fois par visite. */
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
  const size = Math.min(width, height) * 0.36;
  const reveal = draw.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.9, 1] });
  const grow = draw.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const spacing = word.interpolate({ inputRange: [0, 1], outputRange: [18, 10] });
  return (
    <Animated.View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "rgba(11,20,32,0.5)", alignItems: "center", justifyContent: "center", opacity: out, zIndex: 50 }}>
      <Animated.Image source={require("../../assets/brand/logo.png")} accessibilityLabel="Logo GEONEX" resizeMode="contain"
        style={{ width: size, height: size, opacity: reveal, transform: [{ scale: grow }] }} />
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
