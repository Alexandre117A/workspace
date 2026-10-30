import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Path, Rect } from "react-native-svg";
import { Body, H1, Label, Loading, Notice, Screen, useLayout } from "../../components/ui";
import { api } from "../../lib/api";
import { useRequireAuth } from "../../lib/hooks";
import { C, F, S } from "../../theme";

function Folder({ item, width }: { item: any; width: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Dossier ${item.title}`}
      onPress={() => router.push({ pathname: "/create/[id]", params: { id: item.id } })}
      style={({ hovered }: any) => ({ width, gap: S(2), opacity: hovered ? 0.92 : 1 })}>
      <View style={{ height: 14, width: "42%", backgroundColor: C.panelHi, borderWidth: 1, borderBottomWidth: 0, borderColor: C.lineHi }} />
      <View style={{ minHeight: 150, backgroundColor: C.panelHi, borderWidth: 1, borderColor: C.lineHi, padding: S(4), gap: S(2), justifyContent: "space-between" }}>
        <View style={{ gap: S(2) }}>
          <Label color={C.red}>Dossier · {new Date(item.createdAt).toLocaleDateString("fr-FR")}</Label>
          <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }} numberOfLines={2}>{item.title}</Text>
          <Body muted style={{ fontSize: 13 }} numberOfLines={3}>{item.summary}</Body>
        </View>
        <Label color={C.faint}>{item.actors.length} acteurs · {item.sessions} session(s) · {item.provider === "rules" ? "règles du moteur" : "préparé par IA"}</Label>
      </View>
    </Pressable>
  );
}

/** Bouton de création : un tampon « Nouveau dossier » plutôt qu'un simple « + ». */
function NewDossierButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Créer une nouvelle simulation" onPress={() => router.push("/create/new")}
      style={({ pressed, hovered }: any) => ({ position: "absolute", right: S(5), bottom: S(6), transform: [{ rotate: "-4deg" }, { scale: pressed ? 0.96 : hovered ? 1.03 : 1 }] })}>
      <View style={{ borderWidth: 2, borderColor: C.red, backgroundColor: "#160C0C", paddingVertical: 12, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Svg width={26} height={26} viewBox="0 0 26 26">
          <Rect x="3" y="6" width="20" height="16" stroke={C.red} strokeWidth="1.6" fill="none" />
          <Path d="M3 6 L9 2 L15 6" stroke={C.red} strokeWidth="1.6" fill="none" />
          <Path d="M13 10 L13 18 M9 14 L17 14" stroke={C.red} strokeWidth="1.8" />
        </Svg>
        <View>
          <Text style={{ fontFamily: F.monoBold, color: C.red, letterSpacing: 2.5, fontSize: 12 }}>OUVRIR UN</Text>
          <Text style={{ fontFamily: F.monoBold, color: C.text, letterSpacing: 2.5, fontSize: 14 }}>NOUVEAU DOSSIER</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function Library() {
  const user = useRequireAuth("/create");
  const { width } = useLayout();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (!user) return;
    api("/scenarios?mode=fictional").then(setItems).catch((e) => setError(e.message));
  }, [user]));
  const inner = Math.min(width, 1180) - S(8);
  const cols = inner > 900 ? 3 : inner > 560 ? 2 : 1;
  const cardW = (inner - (cols - 1) * S(4)) / cols;
  if (!user) return null;
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ gap: S(6), paddingBottom: 120 }}>
          <Pressable onPress={() => router.push("/")}><Label>← Accueil</Label></Pressable>
          <View style={{ gap: S(2) }}>
            <Label color={C.red}>MODE III</Label>
            <H1>Vos simulations</H1>
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {!items && !error ? <Loading /> : null}
          {items && items.length === 0 ? (
            <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: C.lineHi, padding: S(10), alignItems: "center", gap: S(3) }}>
              <Svg width={64} height={52} viewBox="0 0 64 52">
                <Path d="M2 10 L22 10 L28 4 L62 4 L62 50 L2 50 Z" stroke={C.lineHi} strokeWidth="1.4" fill="none" />
                <Path d="M2 18 L62 18" stroke={C.line} strokeWidth="1" />
              </Svg>
              <Text style={{ fontFamily: F.title, fontSize: 26, color: C.text, textAlign: "center" }}>Aucun dossier pour l'instant</Text>
              <Body muted style={{ textAlign: "center", maxWidth: 460 }}>Imaginez un monde — nations réelles ou fictives, empires, organisations, planètes ou galaxies — et GEONEX en construira les acteurs, les rapports de force et les secrets.</Body>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>
            {items?.map((it) => <Folder key={it.id} item={it} width={cardW} />)}
          </View>
        </View>
      </Screen>
      <NewDossierButton />
    </View>
  );
}
