import { Image, Text, View } from "react-native";
import { C, F } from "../theme";

/** Emblème GEONEX : le globe gravé du logo officiel (assets/brand, régénéré par `npm run brand`). */
export function Emblem({ size = 40 }: { size?: number }) {
  return <Image source={require("../../assets/brand/logo.png")} accessibilityLabel="Logo GEONEX" resizeMode="contain" style={{ width: size, height: size }} />;
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.5 }}>
      <Emblem size={size * 1.5} />
      <Text style={{ fontFamily: F.monoBold, fontSize: size, letterSpacing: size * 0.42, color: C.text }}>GEONEX</Text>
    </View>
  );
}
