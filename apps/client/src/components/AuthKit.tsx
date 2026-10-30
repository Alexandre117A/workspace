import { ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { passwordIssues, PASSWORD_MIN } from "@geonex/shared";
import { StaticGlobe } from "../atlas/home/HeroGlobe";
import { PageScreen } from "./Page";
import { Field, useLayout } from "./ui";
import { C, F, S } from "../theme";

/** Cadre des pages de compte : à gauche l'identité (globe gravé, promesse), à droite le formulaire ; empilés sur téléphone. */
export function AuthFrame({ title, intro, children, aside = true }: { title: string; intro?: string; children: ReactNode; aside?: boolean }) {
  const { width, desktop, phone } = useLayout();
  const inner = Math.min(width, 1100) - S(8);
  const globe = Math.min(phone ? 200 : 300, inner * (desktop ? 0.4 : 0.6));
  return (
    <PageScreen max={1100} footer={false}>
      <View style={{ flexDirection: desktop && aside ? "row" : "column", gap: S(8), alignItems: desktop ? "center" : "stretch", paddingVertical: S(phone ? 4 : 8) }}>
        {aside ? (
          <View style={{ flex: desktop ? 1 : undefined, gap: S(4), alignItems: desktop ? "flex-start" : "center" }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.6, color: C.brass, textTransform: "uppercase" }}>Atlas stratégique</Text>
            <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 34 : 46, lineHeight: phone ? 38 : 50, color: C.text, textAlign: desktop ? "left" : "center", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>{title}</Text>
            {intro ? <Text style={{ fontFamily: F.titleItalic, fontSize: 19, lineHeight: 27, color: "#D9D4C6", maxWidth: 480, textAlign: desktop ? "left" : "center", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } }}>{intro}</Text> : null}
            <View style={{ marginVertical: S(2) }}><StaticGlobe size={globe} /></View>
            <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1.4, color: C.muted }}>Une plateforme gratuite de simulation géopolitique · sans publicité</Text>
          </View>
        ) : null}
        <View style={{ width: desktop && aside ? 460 : "100%", maxWidth: 520, alignSelf: "center", backgroundColor: "#F3F0E9", borderWidth: 1, borderColor: "#D7CFBA", borderTopWidth: 3, borderTopColor: C.brass, padding: S(phone ? 5 : 7), gap: S(4) }}>
          {children}
        </View>
      </View>
    </PageScreen>
  );
}

/** Champs sur surface claire : on reprend `Field` en forçant des couleurs lisibles sur ivoire. */
export const lightField = { backgroundColor: "#FFFFFF", color: "#1B2430", borderColor: "#B9AE92" } as const;

export function LightField(props: any) {
  return <Field {...props} light />;
}

export function PasswordField({ label, value, onChangeText, hint, autoComplete = "new-password", error }: { label: string; value: string; onChangeText: (v: string) => void; hint?: string; autoComplete?: string; error?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <LightField label={label} value={value} onChangeText={onChangeText} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} autoComplete={autoComplete} hint={hint} style={error ? { borderColor: "#963F46" } : undefined} accessibilityLabel={label} />
      <Pressable accessibilityRole="button" accessibilityLabel={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} onPress={() => setShow(!show)} style={{ alignSelf: "flex-end" }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.4, color: "#41698B" }}>{show ? "MASQUER" : "AFFICHER"}</Text>
      </Pressable>
    </View>
  );
}

/** Exigences du mot de passe, cochées en direct. */
export function PasswordChecklist({ value }: { value: string }) {
  if (!value) return <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: "#6B6A66" }}>{PASSWORD_MIN} caractères au moins, avec au moins une lettre et un chiffre.</Text>;
  const bad = new Set(passwordIssues(value));
  const rows: [string, boolean][] = [[`Au moins ${PASSWORD_MIN} caractères`, ![...bad].some((b) => b.startsWith("Au moins " + PASSWORD_MIN))], ["Une lettre", !bad.has("Au moins une lettre.")], ["Un chiffre", !bad.has("Au moins un chiffre.")]];
  return (
    <View style={{ gap: 2 }} accessibilityLiveRegion="polite">
      {rows.map(([t, ok]) => <Text key={t} style={{ fontFamily: F.mono, fontSize: 11.5, color: ok ? "#2F6B37" : "#8A5A0C" }}>{ok ? "✓" : "○"} {t}</Text>)}
    </View>
  );
}

export function FormTitle({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 2.2, color: "#7A6428", textTransform: "uppercase" }}>{kicker}</Text>
      <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: 28, lineHeight: 31, color: C.ink }}>{title}</Text>
      {sub ? <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: C.inkSoft }}>{sub}</Text> : null}
    </View>
  );
}

/** Bouton principal des formulaires sur surface claire. */
export function FormButton({ label, onPress, busy, disabled, ghost }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; ghost?: boolean }) {
  const off = busy || disabled;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!busy }} disabled={off} onPress={onPress}
      style={({ hovered }: any) => ({ paddingVertical: 15, alignItems: "center", backgroundColor: ghost ? "transparent" : hovered ? "#1B3A5E" : C.panel, borderWidth: 1, borderColor: ghost ? "#41698B" : C.panel, borderBottomWidth: 3, borderBottomColor: C.brass, opacity: off ? 0.55 : 1 })}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 12.5, letterSpacing: 2.2, color: ghost ? "#284D74" : "#FFFFFF" }}>{busy ? "…" : label}</Text>
    </Pressable>
  );
}

export function FormLink({ children, href }: { children: ReactNode; href: string }) {
  return <Link href={href as any} asChild><Pressable accessibilityRole="link"><Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: "#284D74", textDecorationLine: "underline" }}>{children}</Text></Pressable></Link>;
}

/** Message sur surface claire (le composant Notice du reste de l'application est conçu pour fond sombre). */
export function FormNotice({ tone = "info", children }: { tone?: "info" | "error" | "ok" | "warn"; children: ReactNode }) {
  const c = { info: "#284D74", error: "#963F46", ok: "#2F6B37", warn: "#8A5A0C" }[tone];
  return (
    <View accessibilityRole="alert" style={{ borderLeftWidth: 3, borderLeftColor: c, backgroundColor: "#FFFFFFB0", paddingVertical: 9, paddingHorizontal: 12 }}>
      <Text style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 19, color: "#1B2430" }}>{children}</Text>
    </View>
  );
}
