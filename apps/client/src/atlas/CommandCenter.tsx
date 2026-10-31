import { ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { Flag } from "../components/Flag";
import { Brackets, HudFrame, Led, TECH } from "../components/game/hud";
import { useReducedMotion } from "../components/ui";
import { C, F, S } from "../theme";
import { AtlasContext } from "./context";
import { HBar, LineChart, StackBar } from "./charts";
import { AtlasPanel, Delta, Empty, Kicker, ProvenanceChip } from "./parts";
import { IntelligencePanel, ScenarioTimeline } from "./panels";
import { Provenance, provenanceOf } from "./provenance";
import { AtlasMapBlock } from "./AtlasWorkspace";
import type { MapFocus } from "./StrategicMap";

/** Centre de commandement (ordinateur) : indicateurs à gauche, carte du théâtre au centre, synthèse à droite, navigation par vues en bas,
 * et espace de décision dans un tiroir. Toutes les données viennent de la vue serveur du participant ; une donnée absente n'est pas affichée. */
export type ViewKey = "overview" | "economy" | "military" | "diplomacy" | "actors" | "events";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "overview", label: "Vue d'ensemble" }, { key: "economy", label: "Économie" }, { key: "military", label: "Militaire" },
  { key: "diplomacy", label: "Diplomatie" }, { key: "actors", label: "Acteurs" }, { key: "events", label: "Événements" },
];
/** Phases où le joueur peut agir : le tiroir s'ouvre au changement de phase et le bouton signale l'attente d'une action. */
const ACTIVE_PHASES = ["dossier", "briefing", "assembly", "diplomacy", "decisions", "consequences"];
const ACTION_PHASES = ["assembly", "diplomacy", "decisions"];

const deltaOf = (previous: Record<string, number> | undefined, k: string, v: number) => (previous && k in previous ? Math.round(v - previous[k]) : null);
const histSeries = (me: any, key: string, label: string, color: string) => ({
  label, color, points: [{ x: 0, y: Math.round(me.initial_capitals?.[key] ?? me.capitals[key]) }, ...(me.history ?? []).map((h: any, i: number) => ({ x: h.round ?? i + 1, y: Math.round(h.capitals[key]) }))],
});

/** Colonne gauche : indicateurs clés avec leur échelle, évolution des capitaux, rapport de force connu. */
function LeftColumn({ ctx, view, previous, width }: { ctx: AtlasContext; view: any; previous?: Record<string, number>; width: number }) {
  const me = view?.me;
  const st: Provenance = ctx.resolved > 0 ? "simulation" : provenanceOf(me?.indicators_source?.status);
  const base = me?.initial_capitals ?? {};
  const tb = view?.true_balance ?? view?.balance;
  const shares: Record<string, number> = tb?.shares ?? {};
  const labels: Record<string, string> = tb?.labels ?? {};
  const campColor = (id: string) => ctx.camps.find((c) => c.id === id)?.color ?? C.steel;
  const parts = Object.entries(shares).map(([k, v]) => ({ label: labels[k] ?? k, value: v, color: campColor(k) }));
  return (
    <View style={{ gap: S(3) }}>
      {me ? (
        <AtlasPanel kicker="Indicateurs clés" title={`Position de ${me.short ?? me.name}`} accent={TECH}>
          <HBar label="Économie" value={me.capitals.economic} base={base.economic} delta={deltaOf(previous, "economic", me.capitals.economic)} color={C.brass} status={st} sub="capital économique, de 0 à 100" />
          <HBar label="Capacité militaire" value={me.capitals.military} base={base.military} delta={deltaOf(previous, "military", me.capitals.military)} color={C.red} status={st} sub="capital militaire, de 0 à 100" />
          <HBar label="Influence diplomatique" value={me.capitals.political} base={base.political} delta={deltaOf(previous, "political", me.capitals.political)} color={C.steel} status={st} sub="capital politique, de 0 à 100" />
          <HBar label="Stabilité intérieure" value={me.stability} delta={deltaOf(previous, "stability", me.stability)} color={C.green} status={ctx.resolved > 0 ? "simulation" : "estimate"} sub="stabilité, de 0 à 100" />
          <HBar label="Soutien intérieur" value={me.approval} delta={deltaOf(previous, "approval", me.approval)} color={C.institutional} status={ctx.resolved > 0 ? "simulation" : "estimate"} sub="approbation du gouvernement, de 0 à 100" />
        </AtlasPanel>
      ) : null}
      {me && (me.history ?? []).length >= 1 ? (
        <AtlasPanel kicker="Évolution stratégique" title="Capitaux, round après round" accent={C.steel}>
          <LineChart width={Math.max(200, width - 64)} height={120} series={[histSeries(me, "political", "Politique", C.steel), histSeries(me, "economic", "Économique", C.brass), histSeries(me, "military", "Militaire", C.red)]} />
          <ProvenanceChip status="simulation" compact />
        </AtlasPanel>
      ) : null}
      {parts.length ? (
        <AtlasPanel kicker="Rapports de force" title="Répartition connue" accent={C.brass}>
          <StackBar parts={parts} />
          <View style={{ gap: 4 }}>
            {parts.map((p) => <View key={p.label} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}><Text style={{ color: p.color }}>■ </Text>{p.label}</Text><Text style={{ fontFamily: F.monoBold, fontSize: 12, color: C.text }}>{Math.round(p.value <= 1 ? p.value * 100 : p.value)} %</Text></View>)}
          </View>
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>Part de chaque camp dans l'indice de puissance, telle que le moteur la révèle à votre rôle.</Text>
        </AtlasPanel>
      ) : null}
      {!me && !parts.length ? <Empty>Aucun indicateur disponible pour votre vue.</Empty> : null}
    </View>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 19, color: C.muted }}>{children}</Text>;
}

/** Vues spécialisées : chacune n'affiche que ce que le moteur fournit pour ce participant. */
function ViewContent({ viewKey, ctx, view, previous, width, onFocusActor }: { viewKey: ViewKey; ctx: AtlasContext; view: any; previous?: Record<string, number>; width: number; onFocusActor: (id: string) => void }) {
  const me = view?.me;
  const st: Provenance = ctx.resolved > 0 ? "simulation" : provenanceOf(me?.indicators_source?.status);
  const sim: Provenance = ctx.resolved > 0 ? "simulation" : "estimate";
  const base = me?.initial_capitals ?? {};
  const name = (id: string) => ctx.actors.find((a) => a.id === id)?.name ?? id;
  const [picked, setPicked] = useState<string | null>(null);
  const chartW = Math.max(240, width - 64);

  if (viewKey === "economy") {
    if (!me) return <Empty>Les données économiques sont réservées aux équipes.</Empty>;
    return (
      <View style={{ gap: S(3) }}>
        <AtlasPanel kicker="Économie" title="Capital économique" accent={C.brass}>
          <HBar label="Capital économique" value={me.capitals.economic} base={base.economic} delta={deltaOf(previous, "economic", me.capitals.economic)} color={C.brass} status={st} sub="se dépense en décisions, se reconstitue lentement" />
          <LineChart width={chartW} height={110} series={[histSeries(me, "economic", "Économique", C.brass)]} />
        </AtlasPanel>
        <AtlasPanel kicker="Ressources" title="Ressources concrètes" accent={C.steel}>
          {(me.resources ?? []).length ? me.resources.map((r: any) => (
            <View key={r.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: S(2), alignItems: "center" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: C.text }}>{r.label}</Text>
                <ProvenanceChip status={r.abstraction ? "simulation" : provenanceOf(r.status)} compact />
              </View>
              <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: r.usable && r.available < r.quantity ? C.amber : C.text }}>{r.usable ? `${r.available}/${r.quantity}` : Number(r.quantity).toLocaleString("fr-FR")} {r.unit}</Text>
            </View>
          )) : <Empty>Aucune ressource n'est définie pour votre acteur dans ce scénario.</Empty>}
          {me.locks?.length ? <Line>Immobilisé : {me.locks.map((l: any) => `${l.quantity} × ${me.resources.find((r: any) => r.key === l.key)?.label ?? l.key} (jusqu'au round ${l.release_round})`).join(" ; ")}</Line> : null}
        </AtlasPanel>
      </View>
    );
  }

  if (viewKey === "military") {
    const wars = ctx.links.filter((l) => l.kind === "war" || l.kind === "escalation");
    const controlled = ctx.zones.filter((z) => z.control);
    return (
      <View style={{ gap: S(3) }}>
        {me ? (
          <AtlasPanel kicker="Militaire" title="Capacités et état des forces" accent={C.red}>
            <HBar label="Capital militaire" value={me.capitals.military} base={base.military} delta={deltaOf(previous, "military", me.capitals.military)} color={C.red} status={st} />
            <HBar label="Disponibilité opérationnelle" value={me.readiness} delta={deltaOf(previous, "readiness", me.readiness)} color={C.institutional} status={sim} />
            <HBar label="Lassitude de guerre" value={me.weariness} delta={deltaOf(previous, "weariness", me.weariness)} invert color={C.red} status={sim} />
            <LineChart width={chartW} height={100} series={[histSeries(me, "military", "Militaire", C.red)]} />
          </AtlasPanel>
        ) : null}
        <AtlasPanel kicker="Conflits" title="Guerres et escalades connues" accent={C.redDeep}>
          {wars.length ? wars.map((l, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: C.text, flex: 1 }}>{name(l.a)} — {name(l.b)}</Text>
              <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1.2, color: l.kind === "war" ? C.red : C.amber, textTransform: "uppercase" }}>{l.label}</Text>
            </View>
          )) : <Empty>Aucun conflit déclaré ni escalade connue de votre rôle.</Empty>}
        </AtlasPanel>
        <AtlasPanel kicker="Contrôle territorial" title="Zones de crise" accent={C.steel}>
          {ctx.zones.length ? [...ctx.zones].sort((a, b) => b.tension - a.tension).map((z) => (
            <View key={z.id} style={{ gap: 4 }}>
              <HBar label={z.name} value={z.tension} invert color={z.tension >= 60 ? C.red : z.tension >= 35 ? C.amber : C.steel} sub={`tension · ${z.domain}`} status={sim} />
              {z.control ? <StackBar height={8} parts={Object.entries(z.control).map(([k, v]) => ({ label: name(k), value: v, color: ctx.camps.find((c) => c.id === ctx.actors.find((a) => a.id === k)?.camp)?.color ?? C.steel }))} /> : null}
            </View>
          )) : <Empty>Aucune zone de crise n'est définie dans ce scénario.</Empty>}
          {controlled.length === 0 && ctx.zones.length ? <Line>La répartition du contrôle n'est pas connue de votre rôle.</Line> : null}
        </AtlasPanel>
      </View>
    );
  }

  if (viewKey === "diplomacy") {
    const comms: any[] = view?.communiques ?? [];
    return (
      <View style={{ gap: S(3) }}>
        {me ? (
          <AtlasPanel kicker="Diplomatie" title="Influence et relations" accent={C.steel}>
            <HBar label="Capital politique" value={me.capitals.political} base={base.political} delta={deltaOf(previous, "political", me.capitals.political)} color={C.steel} status={st} />
            {(me.relations ?? []).length ? [...me.relations].sort((a: any, b: any) => b.tension - a.tension).map((r: any) => (
              <HBar key={r.with} label={`${name(r.with)}${r.at_war ? " · en guerre" : r.alliance ? " · allié" : ""}`} value={r.tension} invert color={r.at_war ? C.red : r.alliance ? C.brass : C.steel} sub={`tension perçue · confiance ${r.trust > 0 ? "+" : ""}${r.trust}`} status={sim} />
            )) : <Empty>Aucune relation bilatérale connue.</Empty>}
          </AtlasPanel>
        ) : null}
        <AtlasPanel kicker="Communiqués" title="Positions déclarées" accent={C.brass}>
          {comms.length ? [...comms].sort((a, b) => b.round - a.round).slice(0, 8).map((c) => (
            <View key={c.id} style={{ gap: 2, borderLeftWidth: 2, borderLeftColor: C.brass, paddingLeft: 10 }}>
              <Kicker color={C.brass}>Round {c.round}</Kicker>
              <Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: C.text }}>{c.title}</Text>
              <Line>{c.general_impact || c.body}</Line>
            </View>
          )) : <Empty>Aucun communiqué n'a encore été publié.</Empty>}
          <Line>Les échanges privés et les appels se font depuis l'espace de décision (phase Diplomatie).</Line>
        </AtlasPanel>
      </View>
    );
  }

  if (viewKey === "actors") {
    const sel = ctx.actors.find((a) => a.id === picked) ?? ctx.me ?? ctx.actors[0];
    const rel = me?.relations?.find((r: any) => r.with === sel?.id);
    return (
      <View style={{ gap: S(3) }}>
        <AtlasPanel kicker="Acteurs" title={`${ctx.actors.length} acteurs du scénario`} accent={C.institutional}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {ctx.actors.map((a) => (
              <Pressable key={a.id} accessibilityRole="button" onPress={() => { setPicked(a.id); onFocusActor(a.id); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: sel?.id === a.id ? TECH : C.lineHi, backgroundColor: sel?.id === a.id ? `${TECH}18` : "transparent" }}>
                <Flag actor={a.raw} h={11} /><Text style={{ fontFamily: F.sansMed, fontSize: 12.5, color: a.isMe ? C.brass : C.text }}>{a.short}</Text>
              </Pressable>
            ))}
          </View>
        </AtlasPanel>
        {sel ? (
          <AtlasPanel tone="ivory" accent={C.brass} kicker={sel.campLabel} title={sel.name} right={<Flag actor={sel.raw} h={16} />}>
            {sel.leader ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: C.ink }}>Dirigeant : {sel.leader}</Text><ProvenanceChip status={sel.leaderStatus} compact light /></View> : null}
            <Text style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 20, color: C.ink }}>{sel.description || "Aucune description n'est disponible pour cet acteur."}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.inkSoft }}>{sel.isMe ? "Votre acteur" : sel.npc ? "Acteur non joué (piloté par le moteur)" : "Acteur joué par une équipe"}</Text>
            {rel ? <Text style={{ fontFamily: F.sansMed, fontSize: 13, color: C.ink }}>Relation avec vous : tension {rel.tension}/100, confiance {rel.trust > 0 ? "+" : ""}{rel.trust}{rel.alliance ? " · alliance" : ""}{rel.at_war ? " · en guerre" : ""}</Text> : null}
          </AtlasPanel>
        ) : null}
      </View>
    );
  }

  // Événements
  const all = [
    ...(view?.communiques ?? []).map((c: any) => ({ id: `c${c.id}`, round: c.round, title: c.title, text: c.general_impact || c.body, color: C.brass, tag: "Communiqué" })),
    ...(view?.private_events ?? []).map((e: any) => ({ id: `p${e.id}`, round: e.round, title: e.title, text: e.text, color: C.red, tag: "Confidentiel" })),
    ...(view?.events ?? []).map((e: any) => ({ id: `e${e.id}`, round: e.round, title: e.title, text: e.text, color: C.steel, tag: "Public" })),
  ].sort((a, b) => b.round - a.round).slice(0, 40);
  return (
    <View style={{ gap: S(3) }}>
      <AtlasPanel kicker="Chronologie" title="Rounds de la simulation" accent={TECH}><ScenarioTimeline ctx={ctx} view={view} vertical /></AtlasPanel>
      <AtlasPanel kicker="Événements" title="Tout ce que vous savez" accent={C.amber}>
        {all.length ? all.map((d) => (
          <View key={d.id} style={{ gap: 2, borderLeftWidth: 2, borderLeftColor: d.color, paddingLeft: 10 }}>
            <Kicker color={d.color}>Round {d.round} · {d.tag}</Kicker>
            <Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: C.text }}>{d.title}</Text>
            <Line>{d.text}</Line>
          </View>
        )) : <Empty>Aucun événement pour l'instant : la simulation commence.</Empty>}
      </AtlasPanel>
    </View>
  );
}

/** Barre de navigation inférieure : vues du centre de commandement et accès à la décision. */
function BottomNav({ viewKey, setView, onDecide, waiting, open }: { viewKey: ViewKey; setView: (v: ViewKey) => void; onDecide: () => void; waiting: boolean; open: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: S(2), paddingHorizontal: S(4), paddingVertical: S(2), borderTopWidth: 1, borderTopColor: `${TECH}44`, backgroundColor: "#07111FF5" }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 4 }} accessibilityRole="tablist">
        {VIEWS.map((v) => {
          const on = viewKey === v.key;
          return (
            <Pressable key={v.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setView(v.key)}
              style={({ hovered }: any) => ({ paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1, borderColor: on ? `${TECH}99` : "transparent", backgroundColor: on ? `${TECH}14` : hovered ? "#ffffff0A" : "transparent" })}>
              <Text style={{ fontFamily: F.sansMed, fontSize: 14, color: on ? C.text : C.muted }}>{v.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <DecideButton onPress={onDecide} waiting={waiting} open={open} />
    </View>
  );
}

function DecideButton({ onPress, waiting, open }: { onPress: () => void; waiting: boolean; open: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!waiting || open || reduced) { a.setValue(0); return; }
    const l = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 1400, useNativeDriver: false }), Animated.timing(a, { toValue: 0, duration: 1400, useNativeDriver: false })]));
    l.start();
    return () => l.stop();
  }, [waiting, open, reduced]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Prendre une décision" onPress={onPress}>
      <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 22, paddingVertical: 12, borderWidth: 1, borderColor: C.brass, backgroundColor: open ? `${C.brass}33` : `${C.brass}14`, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 12.5, letterSpacing: 1.8, color: C.text, textTransform: "uppercase" }}>{open ? "Fermer l'espace de décision" : "Prendre une décision"}</Text>
        {waiting && !open ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brass }} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/** Disposition « centre de commandement » pour grand écran. */
export function CommandCenter({ ctx, view, previous, decision, access, notice, runtime, width, height }: {
  ctx: AtlasContext; view: any; previous?: Record<string, number>; decision: ReactNode; access: ReactNode; notice?: ReactNode; runtime: any; width: number; height: number;
}) {
  const [viewKey, setViewKey] = useState<ViewKey>("overview");
  const [drawer, setDrawer] = useState(false);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const phase: string | undefined = runtime?.phase;
  const lastPhase = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (phase && phase !== lastPhase.current) {
      if (lastPhase.current !== undefined || ACTIVE_PHASES.includes(phase)) setDrawer(ACTIVE_PHASES.includes(phase));
      lastPhase.current = phase;
    }
  }, [phase]);

  const gap = S(4), total = Math.min(width, 1800);
  const leftW = Math.round(Math.min(400, Math.max(320, total * 0.22)));
  const rightW = Math.round(Math.min(420, Math.max(340, total * 0.24)));
  const centerW = Math.max(460, total - leftW - rightW - gap * 4);
  const bodyH = Math.max(420, height - 76);
  const mapH = viewKey === "overview" ? Math.max(380, bodyH - 150) : 280;
  const focusActor = (id: string) => setFocus({ type: "actor", id, n: Date.now() });
  const drawerW = Math.min(520, Math.round(total * 0.34));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, flexDirection: "row", gap, padding: gap, justifyContent: "center" }}>
        <View style={{ width: leftW }}>
          <ScrollView showsVerticalScrollIndicator={false}>{notice}<LeftColumn ctx={ctx} view={view} previous={previous} width={leftW} /></ScrollView>
        </View>
        <View style={{ width: centerW }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: S(3) }}>
            <AtlasMapBlock ctx={ctx} view={view} width={centerW} height={mapH} compact={viewKey !== "overview"} focus={focus} />
            {viewKey === "overview" ? <View style={{ flexDirection: "row", gap: S(3), flexWrap: "wrap" }}>{access}</View> : <ViewContent viewKey={viewKey} ctx={ctx} view={view} previous={previous} width={centerW} onFocusActor={focusActor} />}
          </ScrollView>
        </View>
        <View style={{ width: rightW }}>
          <ScrollView showsVerticalScrollIndicator={false}><IntelligencePanel ctx={ctx} view={view} previous={previous} onFocusActor={focusActor} /></ScrollView>
        </View>
        {drawer ? (
          <HudFrame color={C.brass} style={{ position: "absolute", top: gap, bottom: gap, right: gap, width: drawerW, backgroundColor: "#091525F7", zIndex: 5 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: S(4), paddingVertical: S(3), borderBottomWidth: 1, borderBottomColor: `${C.brass}55` }}>
              <Led color={C.brass} size={7} />
              <Text style={{ flex: 1, fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2, color: C.brass, textTransform: "uppercase" }}>Espace de décision</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Fermer l'espace de décision" onPress={() => setDrawer(false)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${C.brass}66` }}><Text style={{ color: C.brass, fontSize: 18 }}>×</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: S(5) }}>{decision}</ScrollView>
            <Brackets color={C.brass} />
          </HudFrame>
        ) : null}
      </View>
      <BottomNav viewKey={viewKey} setView={setViewKey} onDecide={() => setDrawer((d) => !d)} waiting={!!phase && ACTION_PHASES.includes(phase)} open={drawer} />
    </View>
  );
}
