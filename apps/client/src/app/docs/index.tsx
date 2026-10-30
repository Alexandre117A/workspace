import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { PageScreen } from "../../components/Page";
import { useLayout } from "../../components/ui";
import { ARTICLES, CATEGORIES, searchDocs } from "../../content/docs";
import { C, F, S } from "../../theme";

/** GUIDE GEONEX : recherche et catégories d'articles décrivant les fonctionnalités réellement présentes. */
export default function Docs() {
  const { phone, desktop, width } = useLayout();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const results = useMemo(() => searchDocs(q, cat), [q, cat]);
  const searching = q.trim().length > 0 || cat;
  const inner = Math.min(width, 1180) - S(8);
  const cw = desktop ? Math.floor((inner - S(8)) / 3) : phone ? inner : Math.floor((inner - S(4)) / 2);

  const row = (a: (typeof ARTICLES)[number]) => (
    <Pressable key={a.slug} accessibilityRole="link" onPress={() => router.push(`/docs/${a.slug}` as any)} style={({ hovered }: any) => ({ paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: hovered ? "#FFFFFF0A" : "transparent" })}>
      <Text style={{ fontFamily: F.sansMed, fontSize: 15, color: C.text }}>{a.title}</Text>
      {searching ? <Text numberOfLines={2} style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginTop: 2 }}>{a.intro}</Text> : null}
    </Pressable>
  );

  return (
    <PageScreen max={1180}>
      <View style={{ gap: S(3), marginBottom: S(6), maxWidth: 860 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.6, color: C.brass, textTransform: "uppercase" }}>Centre de documentation</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 40 : 60, lineHeight: phone ? 44 : 64, color: C.text, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>Maîtrisez GEONEX.</Text>
        <Text style={{ fontFamily: F.titleItalic, fontSize: phone ? 18 : 22, lineHeight: phone ? 26 : 30, color: "#D9D4C6", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } }}>
          De votre première simulation à la conception de scénarios complexes, retrouvez les ressources nécessaires pour comprendre et utiliser la plateforme.
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, marginBottom: S(4), maxWidth: 860 }}>
        <Text style={{ paddingLeft: 14, color: C.muted, fontSize: 16 }}>⌕</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Rechercher un article : rejoindre, code, atlas, mot de passe…" placeholderTextColor={C.faint} accessibilityLabel="Rechercher dans la documentation"
          style={{ flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 12, paddingVertical: 13, ...({ outlineStyle: "none" } as any) }} />
        {q ? <Pressable accessibilityRole="button" accessibilityLabel="Effacer" onPress={() => setQ("")} style={{ paddingHorizontal: 14 }}><Text style={{ color: C.muted, fontSize: 16 }}>×</Text></Pressable> : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: S(5) }}>
        {CATEGORIES.map((c) => (
          <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ checked: cat === c.id }} onPress={() => setCat(cat === c.id ? null : c.id)} style={{ paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1, borderColor: cat === c.id ? C.brass : C.line, backgroundColor: cat === c.id ? "#B89A5D26" : "transparent" }}>
            <Text style={{ fontFamily: F.sansMed, fontSize: 12.5, color: cat === c.id ? C.brass : C.muted }}>{c.title}</Text>
          </Pressable>
        ))}
      </View>
      {searching ? (
        <View style={{ maxWidth: 860 }}>
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: 12, color: C.muted, marginBottom: S(2) }}>{results.length} article{results.length > 1 ? "s" : ""}</Text>
          {results.length ? <View style={{ backgroundColor: C.bg2 + "F2", borderWidth: 1, borderColor: C.line }}>{results.map(row)}</View> : (
            <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: C.lineHi, padding: S(6), gap: S(2), backgroundColor: C.bg2 + "D9" }}>
              <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }}>Aucun article ne correspond.</Text>
              <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.muted }}>Essayez un autre mot, ou parcourez les catégories.</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>
          {CATEGORIES.map((c) => (
            <View key={c.id} style={{ width: cw, backgroundColor: C.bg2 + "F2", borderWidth: 1, borderColor: C.lineHi, borderTopWidth: 2, borderTopColor: C.brass }}>
              <View style={{ padding: S(4), gap: 4 }}>
                <Text style={{ fontFamily: F.title, fontSize: 23, color: C.text }}>{c.title}</Text>
                <Text style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 18, color: C.muted }}>{c.blurb}</Text>
              </View>
              {ARTICLES.filter((a) => a.category === c.id && a.published).map(row)}
            </View>
          ))}
        </View>
      )}
    </PageScreen>
  );
}
