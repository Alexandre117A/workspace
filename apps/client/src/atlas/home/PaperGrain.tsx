import { Image, Platform, View } from "react-native";

/** Papier d'atlas : grain (web uniquement), superposé au fond de la carte. */
export function PaperGrain({ opacity = 1 }: { opacity?: number }) {
  if (Platform.OS !== "web") return null;
  const uri = (Image as any).resolveAssetSource?.(require("../../../assets/atlas/paper.png"))?.uri;
  if (!uri) return null;
  return <View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, opacity }, { backgroundImage: `url(${uri})`, backgroundRepeat: "repeat", mixBlendMode: "multiply" } as any]} />;
}
