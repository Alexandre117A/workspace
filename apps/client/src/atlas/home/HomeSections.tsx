import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, Text, View } from "react-native";
import { formatJoinCode, isValidJoinCode } from "@geonex/shared";
import { Field, Notice, useReducedMotion } from "../../components/ui";
import { C, F, S } from "../../theme";
import { HeroGlobe } from "./HeroGlobe";

const FADE: any = Platform.OS === "web" ? { transitionProperty: "transform, opacity, background-color, border-color", transitionDuration: "220ms", transitionTimingFunction: "ease" } : {};

/** Apparition progressive, désactivée si l'utilisateur a demandé de réduire les animations. */
function Reveal({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return a.setValue(1);
    Animated.timing(a, { toValue: 1, duration: 700, delay, useNativeDriver: true }).start();
  }, [reduced]);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>{children}</Animated.View>;
}

function HeroButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ hovered, pressed, focused }: any) => [{
        paddingHorizontal: S(6), paddingVertical: 15, borderWidth: 1, borderColor: primary ? C.brass : hovered ? C.text : C.lineHi,
        backgroundColor: primary ? (hovered ? "#CBAE72" : C.brass) : hovered ? "#FFFFFF14" : "transparent", opacity: pressed ? 0.85 : 1,
        outlineStyle: focused ? "solid" : "none", outlineWidth: 2, outlineColor: C.text,
      } as any, FADE, hovered ? { transform: [{ translateY: -1 }] } : null]}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 12.5, letterSpacing: 2.4, color: primary ? "#1B1608" : C.text }}>{label}</Text>
    </Pressable>
  );
}

/** HERO : titre et appel à l'action à gauche, atlas d'Europe, de Méditerranée et d'Eurasie à droite. */
export function Hero({ width, desktop, phone, onExplore, onCreate }: { width: number; desktop: boolean; phone: boolean; onExplore: () => void; onCreate: () => void }) {
  const gap = S(8);
  const globe = desktop ? Math.min(600, Math.round((width - gap) * 0.52)) : Math.min(width, 560);
  return (
    <View style={{ flexDirection: desktop ? "row" : "column", alignItems: desktop ? "center" : "stretch", gap, marginBottom: S(phone ? 10 : 16) }}>
      <View style={{ flex: desktop ? 1 : undefined, gap: S(5) }}>
        <Reveal>
          <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.6, color: C.brass, textTransform: "uppercase" }}>Atlas stratégique · simulation géopolitique multijoueur</Text>
        </Reveal>
        <Reveal delay={120}>
          <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 40 : desktop ? 68 : 56, lineHeight: phone ? 44 : desktop ? 70 : 58, letterSpacing: 0.4, color: C.text, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>
            LE MONDE EST ENTRE VOS MAINS.
          </Text>
        </Reveal>
        <Reveal delay={260}>
          <Text style={{ fontFamily: F.titleItalic, fontSize: phone ? 18 : 22, lineHeight: phone ? 26 : 31, color: "#D9D4C6", maxWidth: 600, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } }}>
            Rejoignez l'histoire. Affrontez les crises contemporaines. Imaginez de nouveaux équilibres géopolitiques. Chaque décision peut changer le cours des événements.
          </Text>
        </Reveal>
        <Reveal delay={400}>
          <View style={{ gap: S(3) }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(3) }}>
              <HeroButton primary label="EXPLORER LES SIMULATIONS" onPress={onExplore} />
              <HeroButton label="CRÉER UNE SIMULATION" onPress={onCreate} />
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1.2, color: C.faint }}>Multijoueur · gratuit · sans publicité</Text>
          </View>
        </Reveal>
      </View>
      <Reveal delay={300}><View style={{ alignItems: "center" }}><HeroGlobe size={globe} /></View></Reveal>
    </View>
  );
}

/** Rejoindre une session avec un code de participation (fonctionnement inchangé : 10 caractères, XXXXX-XXXXX). */
export function JoinPanel({ code, setCode, onJoin, joining, error, phone }: { code: string; setCode: (c: string) => void; onJoin: () => void; joining: boolean; error: string | null; phone: boolean }) {
  const valid = isValidJoinCode(code);
  const typed = code.replace(/[^A-Za-z0-9]/g, "").length;
  return (
    <View style={{ backgroundColor: "#F3F0E9", borderWidth: 1, borderColor: "#D7CFBA", borderLeftWidth: 4, borderLeftColor: C.brass, padding: S(phone ? 5 : 7), flexDirection: phone ? "column" : "row", gap: S(5), alignItems: phone ? "stretch" : "center" }}>
      <View style={{ flex: 1, gap: S(2) }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 2.2, color: "#7A6428", textTransform: "uppercase" }}>Participer à une partie</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: 28, lineHeight: 31, color: C.ink }}>Rejoindre une session</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: C.inkSoft }}>Entrez le code de participation transmis par le Président de séance : 10 caractères, par exemple ABCDE-FGH23.</Text>
      </View>
      <View style={{ flex: phone ? undefined : 1.1, gap: S(2) }}>
        <View style={{ flexDirection: phone ? "column" : "row", gap: S(3), alignItems: "stretch" }}>
          <View style={{ flex: phone ? undefined : 1 }}>
            <Field value={code} onChangeText={(t) => setCode(formatJoinCode(t))} placeholder="XXXXX-XXXXX" autoCapitalize="characters" autoCorrect={false} onSubmitEditing={onJoin}
              style={{ fontFamily: F.monoBold, letterSpacing: 4, fontSize: 18, backgroundColor: "#FFFFFF", color: C.ink, borderColor: error ? C.redDeep : valid ? "#2F6B37" : "#B9AE92" }} accessibilityLabel="Code de participation" />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Rejoindre la session" disabled={joining} onPress={onJoin}
            style={({ hovered, pressed }: any) => [{ paddingHorizontal: S(6), paddingVertical: phone ? 14 : 0, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? "#1B3A5E" : C.panel, opacity: pressed || joining ? 0.8 : 1 }, FADE]}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 2.2, color: C.text }}>{joining ? "…" : "REJOINDRE"}</Text>
          </Pressable>
        </View>
        {error ? <Notice tone="error">{error}</Notice> : (
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: 11, color: valid ? "#2F6B37" : "#6B5E48" }}>{valid ? "✓ Code valide" : typed ? `${typed} / 10 caractères` : "Le code est transmis par le Président de séance."}</Text>
        )}
      </View>
    </View>
  );
}
