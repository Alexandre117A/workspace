import { Linking, Platform, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Body, H1, Label, Panel, Screen } from "../components/ui";
import credits from "../../assets/chronique/credits.json";
import { C, F, S } from "../theme";

/** Crédits des photographies du fond : auteur, licence et page source de chaque image (obligation des licences CC BY / CC BY-SA). */
export default function Credits() {
  const rows = (credits as any[]).filter((c) => c.label).sort((a, b) => String(a.label).localeCompare(String(b.label), "fr"));
  const open = (url?: string) => { if (url) (Platform.OS === "web" ? (window as any).open(url, "_blank", "noopener") : Linking.openURL(url)); };
  return (
    <Screen max={900}>
      <View style={{ gap: S(5) }}>
        <Pressable onPress={() => router.push("/")}><Label>← Accueil</Label></Pressable>
        <H1>Crédits des images</H1>
        <Body muted>
          Le fond défilant n'utilise que des photographies d'archives, jamais d'images dessinées ou générées : photographies de la NASA (domaine public) et images
          de Wikimedia Commons sous licence libre (domaine public, CC0, CC BY, CC BY-SA). Les drapeaux proviennent de flagcdn.com. Chaque image est créditée ci-dessous.
        </Body>
        <Panel title={`${rows.length} images`}>
          <View style={{ gap: S(3) }}>
            {rows.map((c) => (
              <Pressable key={c.file} onPress={() => open(c.source)} accessibilityRole="link" style={{ paddingBottom: S(2), borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontFamily: F.sans, color: C.text, fontSize: 13 }}>{c.label}{c.year ? ` · ${c.year}` : ""}</Text>
                <Text style={{ fontFamily: F.mono, color: C.muted, fontSize: 11 }}>{c.credit || "Auteur non précisé"} · {c.license || "Domaine public"}</Text>
              </Pressable>
            ))}
          </View>
        </Panel>
      </View>
    </Screen>
  );
}
