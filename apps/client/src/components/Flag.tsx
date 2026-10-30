import { Image, View } from "react-native";
import { flagFor } from "../content/flags";
import { C } from "../theme";

/** Drapeau réel de l'acteur (s'il existe : États et ONU) ; rien n'est inventé pour les entités fictives. */
export function Flag({ actor, h = 18 }: { actor?: { iso_a3?: string | null; id?: string } | null; h?: number }) {
  const src = flagFor(actor);
  if (!src) return null;
  return (
    <View style={{ borderWidth: 1, borderColor: C.lineHi, alignSelf: "center" }}>
      <Image source={src} resizeMode="cover" style={{ width: Math.round(h * 1.5), height: h }} accessibilityLabel="Drapeau" />
    </View>
  );
}
