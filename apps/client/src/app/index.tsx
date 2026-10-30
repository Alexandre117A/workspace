import { useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { Link, router } from "expo-router";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { formatJoinCode, isValidJoinCode } from "@geonex/shared";
import { Wordmark } from "../components/Brand";
import { Intro } from "../components/Intro";
import { Features } from "../components/Features";
import { Body, Btn, Field, Label, Notice, Screen, useLayout } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useConfig } from "../lib/hooks";
import { C, F, MODE_STYLE, S } from "../theme";

type ModeKey = keyof typeof MODE_STYLE;

/** Emblèmes des trois modes (ressources locales : assets/modes/mode{1,2,3}.png, préparées par `npm run logos`). */
const LOGOS = {
  // scale : le globe occupe moins de son cadre que les deux autres emblèmes ; on l'agrandit pour une présence visuelle équivalente.
  contemporary: { src: require("../../assets/modes/mode1.png"), halo: "#7C9CD0", scale: 1.3 },
  historical: { src: require("../../assets/modes/mode2.png"), halo: "#D9AE4E", scale: 1 },
  fictional: { src: require("../../assets/modes/mode3.png"), halo: "#6F9FEF", scale: 1 },
} as const;

// Survol (web) : transitions douces ; sur mobile, aucune transition et aucun survol.
const FADE: any = Platform.OS === "web" ? { transitionProperty: "transform, opacity, filter", transitionDuration: "320ms", transitionTimingFunction: "ease" } : {};

function ModeLogo({ mode, size, hovered }: { mode: ModeKey; size: number; hovered: boolean }) {
  const l = LOGOS[mode];
  const box = Math.round(size * l.scale);
  const off = S(2) - (box - size) / 2; // le centre de l'emblème reste au même endroit, quelle que soit son échelle
  const halo = Math.round(box * 1.8);
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: off, bottom: off, width: box, height: box, alignItems: "center", justifyContent: "center" }}>
      {/* Halo extrêmement discret, à la couleur de l'emblème (dégradé radial, jamais plus lumineux que 0,22). */}
      <View style={[{ position: "absolute", width: halo, height: halo, opacity: hovered ? 1 : 0.6 }, FADE]}>
        <Svg width={halo} height={halo}>
          <Defs>
            <RadialGradient id={`halo-${mode}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={l.halo} stopOpacity="0.22" />
              <Stop offset="0.55" stopColor={l.halo} stopOpacity="0.07" />
              <Stop offset="1" stopColor={l.halo} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={halo} height={halo} fill={`url(#halo-${mode})`} />
        </Svg>
      </View>
      <Image source={l.src} resizeMode="contain" accessible={false}
        style={[{ width: box, height: box }, FADE, hovered ? ({ transform: [{ scale: 1.05 }], ...(Platform.OS === "web" ? { filter: "brightness(1.12)" } : {}) } as any) : null]} />
    </View>
  );
}

function ModeEntry({ mode, href, wide }: { mode: ModeKey; href: string; wide: boolean }) {
  const m = MODE_STYLE[mode];
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={m.label} onPress={() => router.push(href as any)}
      style={({ hovered, pressed }: any) => ({
        flex: wide ? 1 : undefined, minHeight: wide ? 300 : 150, borderWidth: 1, borderColor: hovered ? m.accent : C.line, backgroundColor: pressed ? C.panelHi : C.panel,
        padding: S(5), justifyContent: "space-between", flexDirection: wide ? "column" : "row", gap: S(4), overflow: "hidden",
      })}>
      {({ hovered }: any) => (
        <>
          <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, backgroundColor: m.accent, opacity: 0.8 }} />
          <View style={{ flex: wide ? undefined : 1, gap: S(3) }}>
            <Label color={m.accent}>{m.code}</Label>
            <Text style={{ fontFamily: F.title, fontSize: wide ? 30 : 26, color: C.text, lineHeight: wide ? 34 : 30 }}>{m.label}</Text>
            <Body muted style={{ fontSize: 14 }}>{m.tagline}</Body>
          </View>
          {/* Emplacement réservé : même encombrement que l'ancien pictogramme, la mise en page des cartes ne bouge pas. */}
          <View style={{ width: wide ? 96 : 72, height: wide ? 96 : 72 }} />
          <ModeLogo mode={mode} size={wide ? 124 : 92} hovered={!!hovered} />
        </>
      )}
    </Pressable>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { cfg, error } = useConfig();
  const { phone, desktop } = useLayout();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [intro, setIntro] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);

  const join = async () => {
    setJoinError(null);
    if (!isValidJoinCode(code)) return setJoinError("Le code comporte 10 caractères (format XXXXX-XXXXX).");
    if (!user) return router.push({ pathname: "/auth", params: { next: `/join?code=${encodeURIComponent(code)}` } });
    setJoining(true);
    try {
      const r = await api<{ sessionId: string }>("/sessions/join", { body: { code } });
      router.push(`/session/${r.sessionId}`);
    } catch (e: any) {
      setJoinError(e.message);
    } finally {
      setJoining(false);
    }
  };

  const go = (path: string) => (user ? path : `/auth?next=${encodeURIComponent(path)}`);

  return (
    <View style={{ flex: 1 }}>
    <Screen chronicle={0.9}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S(phone ? 8 : 14) }}>
        <Wordmark size={phone ? 16 : 19} />
        <View style={{ flexDirection: "row", gap: S(4), alignItems: "center" }}>
          {user ? <Link href="/archives"><Label>Archives</Label></Link> : null}
          <Link href={user ? "/account" : "/auth"}><Label color={C.brass}>{user ? user.displayName : "Se connecter"}</Label></Link>
        </View>
      </View>

      <View style={{ gap: S(4), marginBottom: S(phone ? 8 : 12), maxWidth: 820 }}>
        <Label color={C.brass}>Cellule de crise virtuelle · multijoueur</Label>
        <Text style={{ fontFamily: F.title, fontSize: phone ? 40 : desktop ? 66 : 54, lineHeight: phone ? 44 : desktop ? 70 : 58, color: C.text }}>
          Concevez et vivez des simulations géopolitiques.
        </Text>
        <Body muted style={{ fontSize: phone ? 15 : 17, lineHeight: phone ? 22 : 26, maxWidth: 660 }}>
          Chaque équipe incarne un acteur, négocie, engage ses ressources et fait évoluer un monde qui réagit. L'information est imparfaite, les acteurs
          non joués poursuivent leurs propres intérêts, et chaque partie devient une histoire nouvelle.
        </Body>
      </View>

      <View style={{ flexDirection: desktop ? "row" : "column", gap: S(4) }}>
        <ModeEntry mode="contemporary" href={go("/contemporary")} wide={desktop} />
        <ModeEntry mode="historical" href={go("/historical")} wide={desktop} />
        <ModeEntry mode="fictional" href={go("/create")} wide={desktop} />
      </View>

      <View style={{ marginTop: S(6), borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.bg2, padding: S(5), flexDirection: phone ? "column" : "row", gap: S(4), alignItems: phone ? "stretch" : "flex-end" }}>
        <View style={{ flex: 1, gap: S(2) }}>
          <Label color={C.brass}>Rejoindre une session</Label>
          <Body muted>Entrez le code de participation transmis par le Président de séance.</Body>
        </View>
        <View style={{ flex: phone ? undefined : 1, gap: S(2) }}>
          <Field value={code} onChangeText={(t) => setCode(formatJoinCode(t))} placeholder="XXXXX-XXXXX" autoCapitalize="characters" autoCorrect={false}
            onSubmitEditing={join} style={{ fontFamily: F.monoBold, letterSpacing: 4, fontSize: 18 }} accessibilityLabel="Code de participation" />
          {joinError ? <Notice tone="error">{joinError}</Notice> : null}
        </View>
        <Btn label="Rejoindre" onPress={join} busy={joining} />
      </View>

      <View style={{ marginTop: S(10) }}><Features /></View>

      <View style={{ marginTop: S(8), flexDirection: "row", flexWrap: "wrap", gap: S(4), justifyContent: "space-between" }}>
        {user?.role === "owner" ? (
          <Text style={{ color: C.faint, fontFamily: F.mono, fontSize: 11 }}>
          {error ? "Serveur injoignable" : cfg ? `Moteur ${cfg.features.engine ? "en ligne" : "injoignable"}` : "…"}
        </Text>) : <View />}
        <Pressable onPress={() => router.push("/credits")} accessibilityRole="link"><Text style={{ color: C.faint, fontFamily: F.mono, fontSize: 11 }}>GEONEX · gratuit · sans publicité · crédits des images</Text></Pressable>
      </View>
    </Screen>
    {intro ? <Intro onDone={() => setIntro(false)} /> : null}
    </View>
  );
}
