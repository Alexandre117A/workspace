import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { LibraryCard } from "../components/LibraryCard";
import { PageScreen } from "../components/Page";
import { useLayout } from "../components/ui";
import { applyFilters, COMPLEXITY_ORDER, ERA_ORDER, facet, Filters, LibItem, MODE_NAMES, NO_FILTERS, SOURCE_NAMES, useLibrary } from "../lib/library";
import { useAuth } from "../lib/auth";
import { C, F, S } from "../theme";

function Group({ label, options, value, onChange }: { label: string; options: { value: string; label?: string; count: number }[]; value: string | null; onChange: (v: string | null) => void }) {
  if (options.length < 2) return null; // un filtre qui ne distingue rien n'est pas proposé
  return (
    <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2, color: C.faint, textTransform: "uppercase" }}>{label}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(on ? null : o.value)}
              style={({ hovered }: any) => ({ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: on ? C.brass : hovered ? C.lineHi : C.line, backgroundColor: on ? "#B89A5D26" : "transparent" })}>
              <Text style={{ fontFamily: F.sansMed, fontSize: 12.5, color: on ? C.brass : C.muted }}>{o.label ?? o.value}{o.count > 0 ? <Text style={{ color: C.faint, fontFamily: F.mono, fontSize: 11 }}> {o.count}</Text> : null}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** CENTRE DES SCÉNARIOS : recherche et filtres combinables sur les fiches réellement disponibles. */
export default function Library() {
  const { width, phone, desktop, tablet } = useLayout();
  const { user } = useAuth();
  const { items, error, reload } = useLibrary();
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  const all = items ?? [];
  const shown = useMemo(() => applyFilters(all, f), [all, f]);
  const inner = Math.min(width, 1180) - S(8);
  const cols = desktop ? 3 : tablet ? 2 : 1;
  const gap = S(4);
  const cardW = Math.floor((inner - gap * (cols - 1)) / cols);
  const active = [f.mode, f.era, f.region, f.complexity, f.source].filter(Boolean).length + (f.q.trim() ? 1 : 0);

  const panel = (
    <View style={{ gap: S(4), backgroundColor: C.bg2 + "F2", borderWidth: 1, borderColor: C.line, padding: S(4) }}>
      <Group label="Type" value={f.mode} onChange={(v) => set({ mode: v })} options={facet(all, (i) => i.mode).map((o) => ({ ...o, label: MODE_NAMES[o.value as keyof typeof MODE_NAMES] }))} />
      <Group label="Époque" value={f.era} onChange={(v) => set({ era: v })} options={facet(all, (i) => i.eraGroup, ERA_ORDER)} />
      <Group label="Région" value={f.region} onChange={(v) => set({ region: v })} options={facet(all, (i) => i.regionGroup)} />
      <Group label="Complexité" value={f.complexity} onChange={(v) => set({ complexity: v })} options={facet(all, (i) => i.complexity, COMPLEXITY_ORDER)} />
      <Group label="Origine" value={f.source} onChange={(v) => set({ source: v })} options={facet(all, (i) => i.source).map((o) => ({ ...o, label: SOURCE_NAMES[o.value as keyof typeof SOURCE_NAMES] }))} />
      <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 16, color: C.faint }}>La complexité est calculée d'après le nombre d'acteurs (jusqu'à 5 : initiation ; 6–7 : intermédiaire ; 8–9 : avancé ; 10 et plus : expert). La durée se choisit au lancement (30 minutes au minimum, une heure recommandée).</Text>
    </View>
  );

  return (
    <PageScreen>
      <View style={{ gap: S(3), marginBottom: S(6), maxWidth: 820 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.6, color: C.brass, textTransform: "uppercase" }}>Bibliothèque documentaire</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 38 : 56, lineHeight: phone ? 42 : 60, color: C.text, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>CENTRE DES SCÉNARIOS</Text>
        <Text style={{ fontFamily: F.titleItalic, fontSize: phone ? 18 : 22, lineHeight: phone ? 26 : 30, color: "#D9D4C6", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } }}>
          Explorez les grands événements historiques, les crises contemporaines et les univers imaginés par la communauté.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: S(3), flexWrap: "wrap", alignItems: "center", marginBottom: S(4) }}>
        <View style={{ flex: 1, minWidth: 260, flexDirection: "row", alignItems: "center", backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi }}>
          <Text style={{ paddingLeft: 14, color: C.muted, fontSize: 16 }}>⌕</Text>
          <TextInput value={f.q} onChangeText={(q) => set({ q })} placeholder="Rechercher un titre, un pays, une région, une époque, un acteur…" placeholderTextColor={C.faint} accessibilityLabel="Rechercher un scénario"
            style={{ flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 12, paddingVertical: 13, ...({ outlineStyle: "none" } as any) }} />
          {f.q ? <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => set({ q: "" })} style={{ paddingHorizontal: 14 }}><Text style={{ color: C.muted, fontSize: 16 }}>×</Text></Pressable> : null}
        </View>
        <Group label="" value={f.sort} onChange={(v) => set({ sort: (v ?? "relevance") as Filters["sort"] })} options={[{ value: "relevance", label: "Pertinence", count: 0 }, { value: "title", label: "Titre A–Z", count: 0 }, { value: "complexity", label: "Complexité", count: 0 }]} />
        {phone ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ borderWidth: 1, borderColor: C.brass, paddingVertical: 11, paddingHorizontal: 14 }}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: C.brass }}>FILTRES{active ? ` (${active})` : ""} {open ? "−" : "+"}</Text></Pressable> : null}
      </View>

      <View style={{ flexDirection: desktop ? "row" : "column", gap: S(5), alignItems: "flex-start" }}>
        {!phone || open ? <View style={{ width: desktop ? 290 : "100%" }}>{panel}</View> : null}
        <View style={{ flex: 1, width: "100%", gap: S(3) }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{items ? `${shown.length} scénario${shown.length > 1 ? "s" : ""}${active ? ` sur ${all.length}` : ""}` : "Chargement…"}</Text>
            {active ? <Pressable accessibilityRole="button" onPress={() => setF({ ...NO_FILTERS, sort: f.sort })}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: C.brass, textDecorationLine: "underline" }}>RÉINITIALISER LES FILTRES</Text></Pressable> : null}
          </View>
          {error ? <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.red }}>Le catalogue est momentanément indisponible. <Text onPress={reload} style={{ textDecorationLine: "underline" }}>Réessayer</Text></Text> : null}
          {items && !shown.length ? (
            <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: C.lineHi, padding: S(8), alignItems: "center", gap: S(3), backgroundColor: C.bg2 + "D9" }}>
              <Text style={{ fontFamily: F.title, fontSize: 24, color: C.text, textAlign: "center" }}>Aucun scénario ne correspond.</Text>
              <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.muted, textAlign: "center", maxWidth: 440 }}>Essayez d'autres mots, retirez un filtre, ou créez votre propre simulation.</Text>
              <Pressable accessibilityRole="button" onPress={() => setF(NO_FILTERS)} style={{ borderWidth: 1, borderColor: C.brass, paddingVertical: 10, paddingHorizontal: 16 }}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: C.brass }}>RÉINITIALISER LES FILTRES</Text></Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
            {shown.map((i: LibItem) => <LibraryCard key={i.key} item={i} width={desktop ? cardW - (290 + S(5)) / cols : cols === 1 ? inner : Math.floor((inner - gap) / 2)} reload={reload} />)}
          </View>
          {!user && items?.length ? <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.faint }}>Créez un compte gratuit pour enregistrer des scénarios, en publier et lancer des simulations.</Text> : null}
        </View>
      </View>
    </PageScreen>
  );
}
