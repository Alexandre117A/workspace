import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ThumbMap, thumbOf } from "../atlas/home/ScenarioSection";
import { Chipline } from "../components/LibraryCard";
import { PageScreen } from "../components/Page";
import { Loading, useLayout } from "../components/ui";
import { api } from "../lib/api";
import { cleanMessage, useAuth } from "../lib/auth";
import { LibItem, MODE_NAMES, useScenarioActions } from "../lib/library";
import { C, F, MODE_STYLE, S } from "../theme";

/** Fiche détaillée d'un scénario : un dossier de présentation fondé uniquement sur les métadonnées du scénario. */
export default function ScenarioSheet() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const { width, desktop, phone } = useLayout();
  const { user } = useAuth();
  const [item, setItem] = useState<LibItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const load = () => api<LibItem>(`/library/item?key=${encodeURIComponent(String(key))}`).then(setItem).catch((e) => setError(cleanMessage(e.message)));
  useEffect(() => { if (key) load(); }, [key, user?.id]);
  const { toggleFavorite, start } = useScenarioActions(load);
  const here = `/scenario?key=${encodeURIComponent(String(key))}`;
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e: any) { setError(cleanMessage(e.message)); } };

  if (error && !item) {
    return (
      <PageScreen max={900}>
        <View style={{ gap: S(4), paddingVertical: S(10) }}>
          <Text style={{ fontFamily: F.title, fontSize: 32, color: C.text }}>Scénario introuvable</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 15, color: C.muted }}>{error}</Text>
          <Pressable accessibilityRole="link" onPress={() => router.replace("/library")}><Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 1.8, color: C.brass }}>← CENTRE DES SCÉNARIOS</Text></Pressable>
        </View>
      </PageScreen>
    );
  }
  if (!item) return <PageScreen max={900}><Loading label="Ouverture du dossier" /></PageScreen>;
  const m = MODE_STYLE[item.mode];
  const inner = Math.min(width, 1100) - S(8);
  const mapW = desktop ? Math.round(inner * 0.5) : inner;

  const fact = (label: string, value: string) => (
    <View key={label} style={{ flexBasis: phone ? "46%" : "30%", flexGrow: 1, gap: 2, borderLeftWidth: 2, borderLeftColor: C.lineHi, paddingLeft: 10 }}>
      <Chipline>{label}</Chipline>
      <Text style={{ fontFamily: F.sansMed, fontSize: 14.5, color: C.text }}>{value}</Text>
    </View>
  );

  return (
    <PageScreen max={1100}>
      <Pressable accessibilityRole="link" onPress={() => router.push("/library")} style={{ marginBottom: S(4) }}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: C.muted }}>← CENTRE DES SCÉNARIOS</Text></Pressable>
      <View style={{ flexDirection: desktop ? "row" : "column", gap: S(6), alignItems: "flex-start" }}>
        <View style={{ width: mapW, borderWidth: 1, borderColor: C.lineHi, borderTopWidth: 3, borderTopColor: m.accent }}>
          <ThumbMap e={thumbOf(item)} width={mapW - 2} height={Math.round(mapW * 0.72)} hovered={false} />
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 16, color: C.faint, padding: S(3) }}>
            {item.theatre.basemap === "land" ? "Fond géographique neutre : les frontières de l'époque ne sont pas représentées. " : item.theatre.basemap === "schematic" ? "Carte schématique : monde inventé. " : "Frontières actuelles, à titre indicatif. "}
            Repères : zones de crise (losanges) et acteurs (points).
          </Text>
        </View>
        <View style={{ flex: 1, gap: S(3), width: "100%" }}>
          <Chipline color={m.accent}>{`${MODE_NAMES[item.mode]} · ${item.eraLabel}`}</Chipline>
          <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 34 : 44, lineHeight: phone ? 38 : 48, color: C.text, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>{item.title}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.brass }}>{item.startLabel}</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 25, color: "#D9D4C6" }}>{item.summary}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(3), marginTop: S(2) }}>
            {fact("Période", item.startLabel || item.eraLabel)}{fact("Région", item.regionGroup)}{fact("Théâtre", item.region || "—")}
            {fact("Complexité", item.complexity)}{fact("Équipes", "1 à 16, au choix")}{fact("Durée", "au lancement (30 min minimum)")}
            {fact("Origine", item.source === "official" ? "Fiche officielle GEONEX" : item.source === "community" ? `Proposé par ${item.author}` : "Votre scénario")}
          </View>
          {error ? <Text accessibilityRole="alert" style={{ fontFamily: F.sans, fontSize: 13, color: C.red }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(3), marginTop: S(2) }}>
            <Pressable accessibilityRole="button" onPress={() => run(() => start(item, here))} style={({ hovered }: any) => ({ backgroundColor: hovered ? "#CBAE72" : C.brass, paddingVertical: 14, paddingHorizontal: 22 })}><Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 2, color: "#1B1608" }}>COMMENCER UNE SIMULATION</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => run(() => toggleFavorite(item, here))} style={({ hovered }: any) => ({ borderWidth: 1, borderColor: hovered ? C.text : C.lineHi, paddingVertical: 14, paddingHorizontal: 18 })}><Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 1.8, color: C.text }}>{item.favorite ? "★ RETIRER DES FAVORIS" : "☆ ENREGISTRER CE SCÉNARIO"}</Text></Pressable>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: desktop ? "row" : "column", gap: S(5), marginTop: S(8), alignItems: "flex-start" }}>
        <View style={{ flex: 1, width: "100%", backgroundColor: "#F3F0E9", borderWidth: 1, borderColor: "#D7CFBA", borderTopWidth: 3, borderTopColor: C.brass, padding: S(5), gap: S(3) }}>
          <Text style={{ fontFamily: F.title, fontSize: 24, color: C.ink }}>Acteurs ({item.actors.length})</Text>
          {item.actors.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: S(3), borderTopWidth: 1, borderTopColor: "#DDD6C5", paddingTop: 8 }}>
              <Text style={{ fontFamily: F.sansMed, fontSize: 14.5, color: C.ink, flex: 1 }}>{a.name}</Text>
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.inkSoft, flex: 1, textAlign: "right" }}>{a.leader ?? "—"}</Text>
            </View>
          ))}
          <Text style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 17, color: C.inkSoft }}>Les dirigeants indiqués sont ceux du scénario ; leur source (confirmée, estimation ou hypothèse) est précisée dans le dossier confidentiel de chaque équipe au lancement.</Text>
        </View>
        <View style={{ flex: 1, width: "100%", gap: S(3) }}>
          <View style={{ backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, borderTopWidth: 2, borderTopColor: C.steel, padding: S(5), gap: S(2) }}>
            <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }}>Zones de crise ({item.zones})</Text>
            {item.theatre.zones.map((z) => <Text key={z.name} style={{ fontFamily: F.sans, fontSize: 14, color: C.muted }}>◆ {z.name}</Text>)}
          </View>
          <View style={{ backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, borderTopWidth: 2, borderTopColor: C.amber, padding: S(5), gap: S(2) }}>
            <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }}>Fiabilité de cette fiche</Text>
            <Text style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 20, color: C.muted }}>
              {item.source === "official" ? "Fiche construite par le moteur GEONEX à partir du scénario : les faits, estimations et hypothèses sont distingués dans la partie. Ce n'est pas une reconstitution parfaite de la réalité ni une prédiction." : item.source === "community" ? "Scénario proposé par un membre et accepté pour publication. GEONEX ne l'a pas validé historiquement : il s'agit d'un exercice d'exploration stratégique." : "Scénario privé : seul vous le voyez, jusqu'à ce que vous le proposiez à la bibliothèque."}
            </Text>
            <Pressable accessibilityRole="link" onPress={() => router.push("/methodology")}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: C.brass, textDecorationLine: "underline" }}>MÉTHODOLOGIE & FIABILITÉ</Text></Pressable>
          </View>
          {item.source === "community" && user ? (
            <View style={{ gap: S(2) }}>
              {reporting ? (
                <>
                  <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>Pourquoi ce scénario pose-t-il problème ?</Text>
                  <TextInputLite value={reason} onChange={setReason} />
                  <Pressable accessibilityRole="button" onPress={() => run(async () => { await api("/library/report", { body: { key: item.key, reason } }); setReporting(false); setMsg("Signalement transmis aux administrateurs. Merci."); })}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: C.brass }}>ENVOYER LE SIGNALEMENT</Text></Pressable>
                </>
              ) : <Pressable accessibilityRole="button" onPress={() => setReporting(true)}><Text style={{ fontFamily: F.mono, fontSize: 11.5, color: C.faint, textDecorationLine: "underline" }}>Signaler ce scénario</Text></Pressable>}
              {msg ? <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.green }}>{msg}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>
    </PageScreen>
  );
}

function TextInputLite({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { TextInput } = require("react-native");
  return <TextInput value={value} onChangeText={onChange} multiline maxLength={600} accessibilityLabel="Motif du signalement" placeholderTextColor={C.faint} style={{ color: C.text, fontFamily: F.sans, fontSize: 14, borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.panel, padding: 10, minHeight: 80, ...({ outlineStyle: "none" } as any) }} />;
}
