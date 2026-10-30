import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PageScreen, Paper } from "../../components/Page";
import { useLayout } from "../../components/ui";
import { ARTICLES, CATEGORIES } from "../../content/docs";
import { C, F, S } from "../../theme";

const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Article de documentation : introduction, étapes numérotées, explications, liens vers les fonctions et articles associés. */
export default function Article() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { phone } = useLayout();
  const a = ARTICLES.find((x) => x.slug === slug && x.published);
  if (!a) {
    return (
      <PageScreen max={860}>
        <View style={{ gap: S(4), paddingVertical: S(8) }}>
          <Text style={{ fontFamily: F.title, fontSize: 32, color: C.text }}>Article introuvable</Text>
          <Pressable accessibilityRole="link" onPress={() => router.replace("/docs")}><Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 1.8, color: C.brass }}>← CENTRE DE DOCUMENTATION</Text></Pressable>
        </View>
      </PageScreen>
    );
  }
  const cat = CATEGORIES.find((c) => c.id === a.category)!;
  const related = (a.related ?? []).map((s) => ARTICLES.find((x) => x.slug === s && x.published)).filter(Boolean) as typeof ARTICLES;
  return (
    <PageScreen max={900}>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: S(4) }}>
        <Pressable accessibilityRole="link" onPress={() => router.push("/docs")}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: C.muted }}>DOCUMENTATION</Text></Pressable>
        <Text style={{ color: C.faint }}>›</Text>
        <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: C.brass }}>{cat.title.toUpperCase()}</Text>
      </View>
      <Paper style={{ padding: S(phone ? 5 : 8), gap: S(4) }}>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 32 : 42, lineHeight: phone ? 36 : 46, color: C.ink }}>{a.title}</Text>
        <Text style={{ fontFamily: F.titleItalic, fontSize: phone ? 18 : 21, lineHeight: phone ? 26 : 30, color: C.atlas }}>{a.intro}</Text>
        {a.steps ? (
          <View style={{ gap: S(3), paddingTop: S(2) }}>
            {a.steps.map((s, i) => (
              <View key={i} style={{ flexDirection: "row", gap: S(3), alignItems: "flex-start" }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.panel, alignItems: "center", justifyContent: "center", marginTop: 1 }}><Text style={{ fontFamily: F.monoBold, fontSize: 13, color: "#F3F0E9" }}>{i + 1}</Text></View>
                <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 16, lineHeight: 25, color: C.ink }}>{s}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {(a.body ?? []).map((p, i) => <Text key={i} style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 26, color: C.ink }}>{p}</Text>)}
        {a.links?.length ? (
          <View style={{ gap: S(2), paddingTop: S(2), borderTopWidth: 1, borderTopColor: "#DDD6C5" }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 2, color: "#7A6428", textTransform: "uppercase" }}>Accéder à la fonction</Text>
            <View style={{ flexDirection: "row", gap: S(3), flexWrap: "wrap" }}>
              {a.links.map((l) => (
                <Pressable key={l.href} accessibilityRole="link" onPress={() => router.push(l.href as any)} style={({ hovered }: any) => ({ backgroundColor: hovered ? "#1B3A5E" : C.panel, paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 3, borderBottomColor: C.brass })}>
                  <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: "#fff" }}>{l.label.toUpperCase()} →</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.inkSoft }}>Dernière mise à jour : {fmt(a.updated)}</Text>
      </Paper>
      {related.length ? (
        <View style={{ marginTop: S(6), gap: S(2) }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2, color: C.brass, textTransform: "uppercase" }}>Articles associés</Text>
          {related.map((r) => (
            <Pressable key={r.slug} accessibilityRole="link" onPress={() => router.push(`/docs/${r.slug}` as any)} style={({ hovered }: any) => ({ backgroundColor: hovered ? C.panelHi : C.panel, borderWidth: 1, borderColor: C.lineHi, padding: S(3) })}>
              <Text style={{ fontFamily: F.sansMed, fontSize: 15, color: C.text }}>{r.title}</Text>
              <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>{r.intro}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </PageScreen>
  );
}
