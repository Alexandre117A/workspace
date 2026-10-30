import { Text, View } from "react-native";
import Svg, { Circle, Ellipse, Line, Path } from "react-native-svg";
import { C, F } from "../theme";

/** Emblème GEONEX : globe fin, méridiens, nœuds de connexion. Création originale. */
export function Emblem({ size = 40, color = C.brass }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="44" stroke={color} strokeWidth="2" fill="none" />
      <Ellipse cx="50" cy="50" rx="18" ry="44" stroke={color} strokeWidth="1.2" fill="none" opacity={0.75} />
      <Line x1="6" y1="50" x2="94" y2="50" stroke={color} strokeWidth="1.2" opacity={0.75} />
      <Path d="M12 30 Q50 40 88 30 M12 70 Q50 60 88 70" stroke={color} strokeWidth="0.9" fill="none" opacity={0.5} />
      <Path d="M28 22 L66 46 L40 76 Z" stroke={color} strokeWidth="1.6" fill="none" />
      <Circle cx="28" cy="22" r="4" fill={color} />
      <Circle cx="66" cy="46" r="4" fill={color} />
      <Circle cx="40" cy="76" r="4" fill={color} />
    </Svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.5 }}>
      <Emblem size={size * 1.5} />
      <Text style={{ fontFamily: F.monoBold, fontSize: size, letterSpacing: size * 0.42, color: C.text }}>GEONEX</Text>
    </View>
  );
}
