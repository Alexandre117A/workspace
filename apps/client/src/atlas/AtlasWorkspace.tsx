import { ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { PHASE_LABELS } from "@geonex/shared";
import { Flag } from "../components/Flag";
import { useLayout } from "../components/ui";
import { C, F, S } from "../theme";
import { AtlasContext, buildAtlasContext } from "./context";
import { IndicatorsPanel, IntelligencePanel, ScenarioTimeline, useDeltas } from "./panels";
import { MapFocus, StrategicMap } from "./StrategicMap";

/** Contexte et évolutions du round précédent, recalculés à chaque nouvelle vue du serveur. */
export function useAtlas(view: any) {
  const ctx = useMemo(() => buildAtlasContext(view), [view]);
  const previous = useDeltas(ctx, view);
  return { ctx, previous };
}

/** Bandeau stratégique : époque, date simulée, tour, phase, acteur du joueur, camp. */
export function ContextStrip({ ctx, runtime }: { ctx: AtlasContext; runtime?: any }) {
  const { phone } = useLayout();
  const me = ctx.me;
  const camp = ctx.camps.find((c) => c.id === me?.camp);
  const round = runtime?.round ?? ctx.round;
  const total = runtime?.roundsPlanned ?? ctx.roundsPlanned;
  const phase = runtime?.phase ? PHASE_LABELS[runtime.phase as keyof typeof PHASE_LABELS] : null;
  const cell = (k: string, v: string, color: string = C.text) => (
    <View key={k} style={{ gap: 1 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1.6, color: C.faint, textTransform: "uppercase" }}>{k}</Text>
      <Text numberOfLines={1} style={{ fontFamily: F.sansMed, fontSize: phone ? 11.5 : 12.5, color }}>{v}</Text>
    </View>
  );
  return (
    <View accessibilityRole="header" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: phone ? 14 : 28, paddingHorizontal: S(4), paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: "#0A1626F2" }}>
      {cell("Scénario", ctx.identity.title)}
      {cell("Époque", ctx.identity.eraLabel, C.brass)}
      {ctx.simTime ? cell("Date", ctx.simTime) : null}
      {round ? cell("Tour", `${Math.max(1, round)}${total ? ` / ${total}` : ""}`) : null}
      {phase && !phone ? cell("Phase", phase) : null}
      {me ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Flag actor={me.raw} h={13} />
          <View style={{ gap: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1.6, color: C.faint, textTransform: "uppercase" }}>Votre rôle</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sansMed, fontSize: phone ? 11.5 : 12.5, color: camp?.color ?? C.text }}>{me.name}{camp ? ` · ${camp.label}` : ""}</Text>
          </View>
        </View>
      ) : ctx.level === "president" ? cell("Votre rôle", "Président de séance", C.brass) : null}
    </View>
  );
}

type SideTab = "synthesis" | "data" | "timeline";

/** Colonne d'analyse : synthèse stratégique, panneaux de données, chronologie. */
export function AtlasSide({ ctx, view, previous, width, onFocusActor }: { ctx: AtlasContext; view: any; previous?: Record<string, number>; width: number; onFocusActor?: (id: string) => void }) {
  const [tab, setTab] = useState<SideTab>("synthesis");
  const tabs: { key: SideTab; label: string }[] = [{ key: "synthesis", label: "Synthèse" }, { key: "data", label: "Données" }, { key: "timeline", label: "Chronologie" }];
  return (
    <View style={{ gap: S(3) }}>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.lineHi }}>
        {tabs.map((t) => (
          <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)}
            style={{ paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: tab === t.key ? C.brass : "transparent", marginBottom: -1 }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.6, color: tab === t.key ? C.brass : C.muted, textTransform: "uppercase" }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "synthesis" ? <IntelligencePanel ctx={ctx} view={view} previous={previous} onFocusActor={onFocusActor} /> : null}
      {tab === "data" ? <IndicatorsPanel ctx={ctx} view={view} previous={previous} width={width} /> : null}
      {tab === "timeline" ? <ScenarioTimeline ctx={ctx} view={view} vertical /> : null}
    </View>
  );
}

/** Cartouche et carte stratégique ; la chronologie horizontale s'ajoute dessous quand la largeur le permet. */
export function AtlasMapBlock({ ctx, view, width, height, compact, focus }: { ctx: AtlasContext; view: any; width: number; height: number; compact?: boolean; focus?: MapFocus | null }) {
  const st = ctx.geography.style;
  return (
    <View style={{ borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.panel }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: S(3), paddingVertical: 7, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2, color: C.brass, textTransform: "uppercase" }}>Atlas stratégique · {ctx.geography.name}</Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, color: C.faint, textTransform: "uppercase" }}>{st.label}</Text>
      </View>
      <StrategicMap ctx={ctx} width={width - 2} height={height} compact={compact} focus={focus} />
      {!compact ? <View style={{ padding: S(3) }}><ScenarioTimeline ctx={ctx} view={view} /></View> : null}
    </View>
  );
}

/** Tableau atlas autonome (poste du Président) : carte à gauche, analyse à droite sur grand écran ; empilés sinon. */
export function AtlasBoard({ view, ctx, previous, width }: { view: any; ctx: AtlasContext; previous?: Record<string, number>; width: number }) {
  const { desktop, phone } = useLayout();
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const sideW = desktop ? 400 : width;
  const mapW = desktop ? width - sideW - S(4) : width;
  const mapH = desktop ? 560 : phone ? 320 : 420;
  return (
    <View style={{ flexDirection: desktop ? "row" : "column", gap: S(4), alignItems: "flex-start", width }}>
      <View style={{ width: mapW }}><AtlasMapBlock ctx={ctx} view={view} width={mapW} height={mapH} compact={phone} focus={focus} /></View>
      <View style={{ width: sideW }}><AtlasSide ctx={ctx} view={view} previous={previous} width={sideW} onFocusActor={(id) => setFocus({ type: "actor", id, n: Date.now() })} /></View>
    </View>
  );
}

type Pane = "decision" | "map" | "synthesis" | "data";

/**
 * Poste de commandement d'une équipe : décision, carte et analyse réunies.
 * Ordinateur : trois colonnes (décision · atlas · synthèse). Tablette : atlas en haut, onglets dessous.
 * Téléphone : quatre vues (Décision, Carte, Synthèse, Données), la barre d'accès aux dossiers restant en bas.
 */
export function TeamWorkspace({ view, ctx, previous, decision, access, notice, bottomInset = 0 }: { view: any; ctx: AtlasContext; previous?: Record<string, number>; decision: ReactNode; access: ReactNode; notice?: ReactNode; bottomInset?: number }) {
  const { width, height, phone, desktop } = useLayout();
  const [pane, setPane] = useState<Pane>("decision");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const focusActor = (id: string) => { setFocus({ type: "actor", id, n: Date.now() }); if (phone) setPane("map"); };
  const tab = (key: Pane, label: string) => (
    <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: pane === key }} onPress={() => setPane(key)}
      style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: pane === key ? C.brass : "transparent" }}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.4, color: pane === key ? C.brass : C.muted, textTransform: "uppercase" }}>{label}</Text>
    </Pressable>
  );

  if (phone) {
    const w = width;
    return (
      <View style={{ flex: 1 }}>
        <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: "#0A1626F2", borderBottomWidth: 1, borderBottomColor: C.line }}>
          {tab("decision", "Décision")}{tab("map", "Carte")}{tab("synthesis", "Synthèse")}{tab("data", "Données")}
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: bottomInset }}>
          {notice}
          {pane === "decision" ? <View style={{ padding: S(4) }}>{decision}</View> : null}
          {pane === "map" ? <View style={{ padding: S(3), gap: S(3) }}><AtlasMapBlock ctx={ctx} view={view} width={w - S(6)} height={Math.max(300, Math.min(460, height - 330))} compact focus={focus} /><ScenarioTimeline ctx={ctx} view={view} vertical /></View> : null}
          {pane === "synthesis" ? <View style={{ padding: S(3) }}><IntelligencePanel ctx={ctx} view={view} previous={previous} onFocusActor={focusActor} /></View> : null}
          {pane === "data" ? <View style={{ padding: S(3) }}><IndicatorsPanel ctx={ctx} view={view} previous={previous} width={w - S(6)} /></View> : null}
        </ScrollView>
      </View>
    );
  }

  if (!desktop) {
    const w = Math.min(width - S(8), 980);
    const t = pane === "map" ? "decision" : pane;
    return (
      <ScrollView contentContainerStyle={{ padding: S(4), gap: S(4), alignItems: "center", paddingBottom: S(6) }}>
        <View style={{ width: w, gap: S(4) }}>
          {notice}
          <AtlasMapBlock ctx={ctx} view={view} width={w} height={Math.round(Math.min(420, height * 0.4))} focus={focus} />
          <View accessibilityRole="tablist" style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.lineHi }}>
            {tab("decision", "Décision")}{tab("synthesis", "Synthèse")}{tab("data", "Données")}
          </View>
          {t === "decision" ? <View style={{ backgroundColor: "#0E1B2DF2", borderWidth: 1, borderColor: C.lineHi, padding: S(5) }}>{decision}</View> : null}
          {t === "synthesis" ? <IntelligencePanel ctx={ctx} view={view} previous={previous} onFocusActor={focusActor} /> : null}
          {t === "data" ? <IndicatorsPanel ctx={ctx} view={view} previous={previous} width={w} /> : null}
          <View style={{ flexDirection: "row", gap: S(3), flexWrap: "wrap" }}>{access}</View>
        </View>
      </ScrollView>
    );
  }

  // Ordinateur : décision · atlas · synthèse
  const leftW = 520, rightW = 380, gap = S(4);
  const centerW = Math.max(420, Math.min(width, 1800) - leftW - rightW - gap * 4);
  const mapH = Math.max(380, (box.h || height - 170) - 190);
  return (
    <View style={{ flex: 1, flexDirection: "row", gap, padding: gap, justifyContent: "center" }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View style={{ width: leftW }}>
        <ScrollView style={{ flex: 1, backgroundColor: "#0E1B2DF2", borderWidth: 1, borderColor: C.lineHi }} contentContainerStyle={{ padding: S(5) }}>{notice}{decision}</ScrollView>
      </View>
      <View style={{ width: centerW, gap: S(3) }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: S(3) }}>
          <AtlasMapBlock ctx={ctx} view={view} width={centerW} height={mapH} focus={focus} />
          <View style={{ flexDirection: "row", gap: S(3), flexWrap: "wrap" }}>{access}</View>
        </ScrollView>
      </View>
      <View style={{ width: rightW }}>
        <ScrollView showsVerticalScrollIndicator={false}><AtlasSide ctx={ctx} view={view} previous={previous} width={rightW} onFocusActor={focusActor} /></ScrollView>
      </View>
    </View>
  );
}
