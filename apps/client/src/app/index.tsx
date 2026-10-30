import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Link, router } from "expo-router";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { formatJoinCode, isValidJoinCode } from "@geonex/shared";
import { Wordmark } from "../components/Brand";
import { Intro } from "../components/Intro";
import { Body, Btn, Field, Label, Notice, Screen, useLayout } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useConfig } from "../lib/hooks";
import { C, F, MODE_STYLE, S } from "../theme";

type ModeKey = keyof typeof MODE_STYLE;

/** Vignettes originales propres à chaque mode (aucun emblème officiel). */
function ModeArt({ mode, size }: { mode: ModeKey; size: number }) {
  const c = MODE_STYLE[mode].accent;
  if (mode === "contemporary") {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r="40" stroke={c} strokeWidth="0.8" fill="none" opacity={0.6} />
        <Circle cx="50" cy="50" r="26" stroke={c} strokeWidth="0.8" fill="none" opacity={0.4} />
        <Line x1="10" y1="50" x2="90" y2="50" stroke={c} strokeWidth="0.6" opacity={0.5} />
        <Line x1="50" y1="10" x2="50" y2="90" stroke={c} strokeWidth="0.6" opacity={0.5} />
        <Line x1="50" y1="50" x2="82" y2="28" stroke={c} strokeWidth="1.6" />
        <Circle cx="68" cy="38" r="3" fill={c} />
        <Circle cx="32" cy="62" r="2" fill={c} opacity={0.6} />
      </Svg>
    );
  }
  if (mode === "historical") {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d="M20 80 L20 30 Q50 14 80 30 L80 80 Z" stroke={c} strokeWidth="0.9" fill="none" opacity={0.7} />
        <Path d="M30 72 L30 38 M42 72 L42 33 M58 72 L58 33 M70 72 L70 38" stroke={c} strokeWidth="0.8" opacity={0.5} />
        <Path d="M14 84 L86 84" stroke={c} strokeWidth="1.4" />
        <Circle cx="50" cy="52" r="7" stroke={c} strokeWidth="1.2" fill="none" />
        <Path d="M50 47 L50 52 L54 54" stroke={c} strokeWidth="1.2" fill="none" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="34" stroke={c} strokeWidth="0.8" fill="none" opacity={0.5} strokeDasharray="2 3" />
      <Circle cx="28" cy="36" r="6" stroke={c} strokeWidth="1.2" fill="none" />
      <Circle cx="70" cy="30" r="9" stroke={c} strokeWidth="1.2" fill="none" />
      <Circle cx="62" cy="72" r="5" stroke={c} strokeWidth="1.2" fill="none" />
      <Path d="M33 39 L62 69 M36 34 L61 31 M68 39 L63 67" stroke={c} strokeWidth="0.8" opacity={0.6} />
    </Svg>
  );
}

function ModeEntry({ mode, href, wide }: { mode: ModeKey; href: string; wide: boolean }) {
  const m = MODE_STYLE[mode];
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={m.label} onPress={() => router.push(href as any)}
      style={({ hovered, pressed }: any) => ({
        flex: wide ? 1 : undefined, minHeight: wide ? 300 : 150, borderWidth: 1, borderColor: hovered ? m.accent : C.line, backgroundColor: pressed ? C.panelHi : C.panel,
        padding: S(5), justifyContent: "space-between", flexDirection: wide ? "column" : "row", gap: S(4),
      })}>
      <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, backgroundColor: m.accent, opacity: 0.8 }} />
      <View style={{ flex: wide ? undefined : 1, gap: S(3) }}>
        <Label color={m.accent}>{m.code}</Label>
        <Text style={{ fontFamily: F.title, fontSize: wide ? 30 : 26, color: C.text, lineHeight: wide ? 34 : 30 }}>{m.label}</Text>
        <Body muted style={{ fontSize: 14 }}>{m.tagline}</Body>
      </View>
      <View style={{ alignItems: wide ? "flex-end" : "center", justifyContent: "flex-end" }}>
        <ModeArt mode={mode} size={wide ? 96 : 72} />
      </View>
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
    <Screen chronicle={0.42}>
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

      <View style={{ marginTop: S(8), flexDirection: "row", flexWrap: "wrap", gap: S(4), justifyContent: "space-between" }}>
        <Text style={{ color: C.faint, fontFamily: F.mono, fontSize: 11 }}>
          {error ? "Serveur injoignable" : cfg ? `Moteur ${cfg.features.engine ? "en ligne" : "injoignable"} · IA ${cfg.features.ai ? "active" : "non configurée (règles du moteur)"} · Voix ${cfg.features.voice ? "active" : "non configurée (canal texte)"}` : "…"}
        </Text>
        <Text style={{ color: C.faint, fontFamily: F.mono, fontSize: 11 }}>GEONEX · gratuit · sans publicité</Text>
      </View>
    </Screen>
    {intro ? <Intro onDone={() => setIntro(false)} /> : null}
    </View>
  );
}
