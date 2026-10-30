import { useRef, useState } from "react";
import { Image, Linking, Platform, Pressable, Text, View } from "react-native";
import { Link, router } from "expo-router";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { isValidJoinCode } from "@geonex/shared";
import { WorldBuildArt, ContemporaryArt, HistoricalArt } from "../atlas/home/ModeArt";
import { Hero, JoinPanel } from "../atlas/home/HomeSections";
import { ScenarioSection } from "../atlas/home/ScenarioSection";
import { CatalogEntry, useCatalog } from "../atlas/home/world";
import { Wordmark } from "../components/Brand";
import { Intro } from "../components/Intro";
import { Features } from "../components/Features";
import { Body, Label, Screen, useLayout } from "../components/ui";
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

/** Concept visuel de chaque carte, affiché en surimpression discrète (le titre et la description d'origine restent inchangés). */
const CONCEPTS: Record<ModeKey, string> = { contemporary: "Le monde sous tension", historical: "Les frontières du temps", fictional: "Construire un monde" };

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

function ModeEntry({ mode, href, wide, entries }: { mode: ModeKey; href: string; wide: boolean; entries: CatalogEntry[] }) {
  const m = MODE_STYLE[mode];
  const [box, setBox] = useState({ w: 0, h: 0 });
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${m.label}. ${CONCEPTS[mode]}`} onPress={() => router.push(href as any)}
      onLayout={(e: any) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
      style={({ hovered, pressed }: any) => ({
        flex: wide ? 1 : undefined, minHeight: wide ? 310 : 190, borderWidth: 1, borderColor: hovered ? m.accent : C.line, backgroundColor: pressed ? C.panelHi : C.panel,
        padding: S(5), justifyContent: "space-between", flexDirection: wide ? "column" : "row", gap: S(4), overflow: "hidden",
      })}>
      {({ hovered }: any) => (
        <>
          {box.w > 0 ? (
            mode === "contemporary" ? <ContemporaryArt width={box.w} height={box.h} hovered={!!hovered} entries={entries} />
              : mode === "historical" ? <HistoricalArt width={box.w} height={box.h} hovered={!!hovered} />
              : <WorldBuildArt width={box.w} height={box.h} hovered={!!hovered} />
          ) : null}
          <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, backgroundColor: m.accent, opacity: 0.8 }} />
          <View style={{ flex: wide ? undefined : 1, gap: S(3), maxWidth: wide ? "78%" : "72%" }}>
            <Label color={m.accent}>{m.code}</Label>
            <Text style={{ fontFamily: F.title, fontSize: wide ? 30 : 26, color: C.text, lineHeight: wide ? 34 : 30 }}>{m.label}</Text>
            <Body muted style={{ fontSize: 14 }}>{m.tagline}</Body>
            <Text style={{ fontFamily: F.titleItalic, fontSize: 14, color: m.accent, opacity: 0.9 }}>{CONCEPTS[mode]}</Text>
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
  const { width, phone, tablet, desktop } = useLayout();
  const { entries } = useCatalog();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [intro, setIntro] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const scroller = useRef<any>(null);
  const [scenariosY, setScenariosY] = useState(0);

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
  const inner = Math.min(width, 1180) - S(8);
  const section = { marginTop: S(phone ? 12 : 18) } as const;

  return (
    <View style={{ flex: 1 }}>
    <Screen chronicle={0.9} scrollRef={scroller}>
      {cfg?.features.preview ? (
        <View accessibilityRole="alert" style={{ marginBottom: S(4), flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S(3), backgroundColor: "#F3F0E9", borderLeftWidth: 4, borderLeftColor: C.brass, paddingVertical: 10, paddingHorizontal: S(4) }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2, color: "#7A6428", textTransform: "uppercase" }}>Version d'essai</Text>
          <Text style={{ flex: 1, minWidth: 220, fontFamily: F.sans, fontSize: 13.5, color: C.ink }}>Vous visitez la refonte « Atlas stratégique », encore à l'étude.</Text>
          {cfg.stableUrl ? (
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(cfg.stableUrl as string)}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: C.ink, textDecorationLine: "underline" }}>VERSION STABLE ›</Text></Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: S(phone ? 8 : 12) }}>
        <Wordmark size={phone ? 16 : 19} />
        <View style={{ flexDirection: "row", gap: S(4), alignItems: "center" }}>
          {user ? <Link href="/archives"><Label>Archives</Label></Link> : null}
          <Link href={user ? "/account" : "/auth"}><Label color={C.brass}>{user ? user.displayName : "Se connecter"}</Label></Link>
        </View>
      </View>

      <Hero width={inner} desktop={desktop} phone={phone} onExplore={() => scroller.current?.scrollTo({ y: Math.max(0, scenariosY - 16), animated: true })} onCreate={() => router.push(go("/create") as any)} />

      <View style={{ gap: S(3) }}>
        <Label color={C.brass}>Choisir un mode de simulation</Label>
        <View style={{ flexDirection: desktop ? "row" : "column", gap: S(4) }}>
          <ModeEntry mode="contemporary" href={go("/contemporary")} wide={desktop} entries={entries} />
          <ModeEntry mode="historical" href={go("/historical")} wide={desktop} entries={entries} />
          <ModeEntry mode="fictional" href={go("/create")} wide={desktop} entries={entries} />
        </View>
      </View>

      <View style={section} onLayout={(e) => setScenariosY(e.nativeEvent.layout.y)}>
        <ScenarioSection width={inner} cols={desktop ? 3 : tablet ? 2 : 1} go={go} />
      </View>

      <View style={section}>
        <JoinPanel code={code} setCode={setCode} onJoin={join} joining={joining} error={joinError} phone={phone} />
      </View>

      <View style={{ marginTop: S(12) }}><Features /></View>

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
