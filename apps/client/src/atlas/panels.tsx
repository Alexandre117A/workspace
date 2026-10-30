import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Flag } from "../components/Flag";
import { C, F, S } from "../theme";
import { HBar, LineChart, StackBar } from "./charts";
import { AtlasContext, buildIntelligence, keyIndicators, snapshotNumbers } from "./context";
import { AtlasPanel, Delta, Empty, Kicker, ProvenanceChip } from "./parts";
import { Provenance, provenanceOf } from "./provenance";

/** Valeurs du round précédent (celles que ce client a vues) : sert à montrer l'évolution, jamais à en inventer une. */
export function useDeltas(ctx: AtlasContext | null, view: any): Record<string, number> | undefined {
  const seen = useRef<Record<number, Record<string, number>>>({});
  if (!ctx) return undefined;
  seen.current[ctx.round] = snapshotNumbers(ctx, view);
  return seen.current[ctx.round - 1];
}

const TONE = { red: C.red, amber: C.amber, steel: C.steel, brass: C.brass } as const;
const SCOPE = { communique: { label: "Communiqué", color: C.brass }, private: { label: "Confidentiel", color: C.red }, public: { label: "Public", color: C.steel } } as const;

/** STRATEGIC INTELLIGENCE : synthèse dynamique, entièrement tirée de l'état de la partie. */
export function IntelligencePanel({ ctx, view, previous, onFocusActor }: { ctx: AtlasContext; view: any; previous?: Record<string, number>; onFocusActor?: (id: string) => void }) {
  const intel = buildIntelligence(ctx, view);
  const kpis = keyIndicators(ctx, view, previous);
  const actors = [...ctx.actors].sort((a, b) => Number(b.isMe) - Number(a.isMe) || Number(a.npc) - Number(b.npc)).slice(0, 7);
  const fiction = ctx.identity.mode === "fictional";
  const narrativeStatus: Provenance | null = fiction ? "fiction" : ctx.resolved > 0 ? "simulation" : null;
  return (
    <View style={{ gap: S(3) }}>
      <AtlasPanel tone="ivory" accent={C.brass} kicker="Situation générale" title={intel.situation.title}
        right={narrativeStatus ? <ProvenanceChip status={narrativeStatus} compact light /> : undefined}>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.3, color: C.inkSoft, textTransform: "uppercase" }}>{intel.situation.kicker}</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 21, color: C.ink }}>{intel.situation.text || "Aucun résumé disponible pour l'instant."}</Text>
      </AtlasPanel>

      {kpis.length ? (
        <AtlasPanel kicker="Indicateurs clés" title={view?.me ? "Votre position" : "Situation du théâtre"} accent={C.steel}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(3) }}>
            {kpis.map((k) => (
              <View key={k.key} style={{ flexBasis: "47%", flexGrow: 1, gap: 3, borderLeftWidth: 2, borderLeftColor: C.lineHi, paddingLeft: 10 }}>
                <Kicker>{k.label}</Kicker>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <Text style={{ fontFamily: F.title, fontSize: 28, color: C.text }}>{k.value}</Text>
                  <Delta value={k.delta} invert={k.key === "territories"} />
                </View>
                <Text style={{ fontFamily: F.sans, fontSize: 11.5, lineHeight: 15, color: C.faint }}>{k.sub}</Text>
                <ProvenanceChip status={k.status} compact />
              </View>
            ))}
          </View>
        </AtlasPanel>
      ) : null}

      <AtlasPanel kicker="Acteurs principaux" title={`${ctx.actors.length} acteurs`} accent={C.institutional} collapsible defaultOpen>
        {actors.length ? actors.map((a) => (
          <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`Voir ${a.name} sur la carte`} onPress={() => onFocusActor?.(a.id)} style={({ hovered }: any) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4, opacity: hovered ? 0.85 : 1 })}>
            <View style={{ width: 8, height: 8, backgroundColor: ctx.camps.find((c) => c.id === a.camp)?.color ?? C.muted }} />
            <Flag actor={a.raw} h={12} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.sansMed, fontSize: 13.5, color: a.isMe ? C.brass : C.text }}>{a.name}{a.isMe ? "  · vous" : ""}</Text>
              <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{a.leader ?? a.campLabel}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, color: C.faint, textTransform: "uppercase" }}>{a.npc ? "non joué" : "équipe"}</Text>
          </Pressable>
        )) : <Empty>Aucun acteur n'est encore connu.</Empty>}
        {ctx.camps.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 4 }}>
            {ctx.camps.map((c) => <View key={c.id} style={{ flexDirection: "row", gap: 5, alignItems: "center" }}><View style={{ width: 8, height: 8, backgroundColor: c.color }} /><Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>{c.label}</Text></View>)}
          </View>
        ) : null}
      </AtlasPanel>

      <AtlasPanel kicker="Développements récents" title="Derniers événements" accent={C.amber} collapsible defaultOpen>
        {intel.developments.length ? intel.developments.map((d) => (
          <View key={`${d.scope}${d.id}`} style={{ gap: 2, borderLeftWidth: 2, borderLeftColor: SCOPE[d.scope].color, paddingLeft: 10 }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.4, color: SCOPE[d.scope].color, textTransform: "uppercase" }}>Round {d.round} · {SCOPE[d.scope].label}</Text>
            <Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: C.text }}>{d.title}</Text>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 17, color: C.muted }}>{d.text}</Text>
          </View>
        )) : <Empty>Aucun événement pour l'instant : la simulation commence.</Empty>}
      </AtlasPanel>

      <AtlasPanel kicker="Points de tension" title="Où la crise se joue" accent={C.redDeep} collapsible defaultOpen>
        {intel.tensions.length ? intel.tensions.map((t, i) => (
          <HBar key={i} label={t.label} value={t.value} color={TONE[t.tone]} sub={t.sub} invert status={ctx.resolved > 0 ? "simulation" : "hypothesis"} />
        )) : <Empty>Aucune zone de crise ni escalade connue pour l'instant.</Empty>}
      </AtlasPanel>

      {intel.perspectives.length ? (
        <AtlasPanel kicker="Perspectives stratégiques" title={intel.perspectivesTitle} accent={C.brass} collapsible defaultOpen={false}>
          {intel.perspectives.map((p, i) => (
            <View key={i} style={{ gap: 4 }}>
              <Kicker color={TONE[p.tone]}>{p.label}</Kicker>
              <Text style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 18, color: C.text }}>{p.text}</Text>
              {p.progress != null ? <View style={{ height: 4, backgroundColor: C.line }}><View style={{ height: 4, width: `${Math.round(Math.min(1, Math.max(0, p.progress)) * 100)}%`, backgroundColor: TONE[p.tone] }} /></View> : null}
            </View>
          ))}
        </AtlasPanel>
      ) : null}
    </View>
  );
}

type Tab = "balance" | "capitals" | "domestic" | "relations" | "actors";

/** Panneaux de données : seuls les onglets alimentés par des données réelles apparaissent. */
export function IndicatorsPanel({ ctx, view, previous, width }: { ctx: AtlasContext; view: any; previous?: Record<string, number>; width: number }) {
  const me = view?.me;
  const tabs: { key: Tab; label: string }[] = [];
  if (view?.true_balance || view?.balance) tabs.push({ key: "balance", label: "Rapport de force" });
  if (me) tabs.push({ key: "capitals", label: "Capitaux" }, { key: "domestic", label: "Intérieur" });
  if (me?.relations?.length) tabs.push({ key: "relations", label: "Relations" });
  if (view?.actors_detail?.length) tabs.push({ key: "actors", label: "Acteurs" });
  const [tab, setTab] = useState<Tab | null>(null);
  const cur = tabs.find((t) => t.key === tab)?.key ?? tabs[0]?.key;
  const d = (k: string, v: number) => (previous && k in previous ? Math.round(v - previous[k]) : null);
  const st: Provenance = ctx.resolved > 0 ? "simulation" : provenanceOf(me?.indicators_source?.status);
  const sim: Provenance = ctx.resolved > 0 ? "simulation" : "estimate";
  const campColor = (id: string) => ctx.camps.find((c) => c.id === id)?.color ?? C.steel;

  let body: React.ReactNode = <Empty>Aucun indicateur n'est encore disponible pour votre vue.</Empty>;
  if (cur === "balance") {
    const tb = view.true_balance;
    const shares: Record<string, number> = tb?.shares ?? view.balance?.shares ?? {};
    const labels: Record<string, string> = tb?.labels ?? view.balance?.labels ?? {};
    const parts = Object.entries(shares).map(([k, v]) => ({ label: labels[k] ?? k, value: v, color: campColor(k) }));
    const hist: any[] = tb?.history ?? [];
    const series = Object.keys(shares).map((k) => ({ label: labels[k] ?? k, color: campColor(k), points: hist.filter((h) => h.shares && h.shares[k] != null).map((h) => ({ x: h.round, y: Math.round(h.shares[k] * (h.shares[k] <= 1 ? 100 : 1)) })) }));
    body = (
      <View style={{ gap: S(3) }}>
        <StackBar parts={parts} />
        <LineChart series={series} width={Math.max(220, width - 64)} />
        <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>{tb ? "Rapport de force réel (vision du Président)." : "Rapport de force tel qu'il est connu des participants, révélé à partir du round 3."}</Text>
        <ProvenanceChip status="simulation" compact />
      </View>
    );
  } else if (cur === "capitals" && me) {
    const base = me.initial_capitals ?? {};
    body = (
      <View style={{ gap: S(3) }}>
        <HBar label="Capital politique" value={me.capitals.political} base={base.political} delta={d("political", me.capitals.political)} color={C.steel} status={st} />
        <HBar label="Capital économique" value={me.capitals.economic} base={base.economic} delta={d("economic", me.capitals.economic)} color={C.brass} status={st} />
        <HBar label="Capital militaire" value={me.capitals.military} base={base.military} delta={d("military", me.capitals.military)} color={C.red} status={st} />
        <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>Le trait clair marque la valeur de départ. Les capitaux se dépensent en décisions et se reconstituent lentement.</Text>
      </View>
    );
  } else if (cur === "domestic" && me) {
    body = (
      <View style={{ gap: S(3) }}>
        <HBar label="Stabilité" value={me.stability} delta={d("stability", me.stability)} color={C.green} status={sim} />
        <HBar label="Cohésion" value={me.cohesion} delta={d("cohesion", me.cohesion)} color={C.steel} status={sim} />
        <HBar label="Approbation" value={me.approval} delta={d("approval", me.approval)} color={C.brass} status={sim} />
        <HBar label="Disponibilité des forces" value={me.readiness} delta={d("readiness", me.readiness)} color={C.institutional} status={sim} />
        <HBar label="Lassitude de guerre" value={me.weariness} delta={d("weariness", me.weariness)} invert color={C.red} status={sim} />
      </View>
    );
  } else if (cur === "relations" && me) {
    const name = (id: string) => ctx.actors.find((a) => a.id === id)?.name ?? id;
    body = (
      <View style={{ gap: S(3) }}>
        {[...me.relations].sort((a: any, b: any) => b.tension - a.tension).slice(0, 10).map((r: any) => (
          <HBar key={r.with} label={`${name(r.with)}${r.at_war ? " · en guerre" : r.alliance ? " · allié" : ""}`} value={r.tension} invert color={r.at_war ? C.red : r.alliance ? C.brass : C.steel}
            sub={`confiance ${r.trust > 0 ? "+" : ""}${r.trust}`} status={sim} />
        ))}
        <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>Tension de 0 à 100, telle que votre acteur la perçoit.</Text>
      </View>
    );
  } else if (cur === "actors") {
    body = (
      <View style={{ gap: S(3) }}>
        {view.actors_detail.map((a: any) => (
          <HBar key={a.id} label={`${a.name}${a.controlled_by === "human" ? " · équipe" : ""}`} value={a.stability} color={campColor(a.camp)} sub={`approbation ${Math.round(a.approval)} · cohésion ${Math.round(a.cohesion)}`} status={sim} />
        ))}
        <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>Stabilité intérieure de chaque acteur (vision du Président).</Text>
      </View>
    );
  }
  return (
    <AtlasPanel kicker="Panneaux de données" title="Indicateurs" accent={C.steel}>
      {tabs.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityRole="tablist">
          {tabs.map((t) => (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: cur === t.key }} onPress={() => setTab(t.key)}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: cur === t.key ? C.brass : C.lineHi, backgroundColor: cur === t.key ? "#B89A5D22" : "transparent" }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1.3, color: cur === t.key ? C.brass : C.muted, textTransform: "uppercase" }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {body}
    </AtlasPanel>
  );
}

/** Chronologie des rounds : titres et date simulée réels ; les rounds à venir sont seulement comptés. */
export function ScenarioTimeline({ ctx, view, vertical = false }: { ctx: AtlasContext; view: any; vertical?: boolean }) {
  const rounds: any[] = view?.rounds ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const total = Math.max(ctx.roundsPlanned, ctx.round, rounds.length);
  if (!total) return null;
  const items = Array.from({ length: total }, (_, i) => ({ n: i + 1, r: rounds.find((x) => x.round === i + 1) }));
  const sel = open != null ? rounds.find((r) => r.round === open) : null;
  return (
    <View style={{ gap: 6 }} accessibilityRole="list">
      <View style={{ flexDirection: vertical ? "column" : "row", gap: vertical ? 6 : 0, alignItems: vertical ? "stretch" : "flex-start" }}>
        {items.map((it, i) => {
          const done = !!it.r, current = it.n === ctx.round;
          const color = current ? C.brass : done ? C.steel : C.lineHi;
          return (
            <Pressable key={it.n} disabled={!done} accessibilityRole="button" accessibilityLabel={done ? `Round ${it.n} : ${it.r.title}` : `Round ${it.n} à venir`} onPress={() => setOpen(open === it.n ? null : it.n)}
              style={{ flex: vertical ? undefined : 1, flexDirection: vertical ? "row" : "column", gap: vertical ? 10 : 4, alignItems: vertical ? "center" : "flex-start" }}>
              <View style={{ flexDirection: "row", alignItems: "center", width: vertical ? undefined : "100%" }}>
                <View style={{ width: current ? 12 : 9, height: current ? 12 : 9, borderRadius: 6, backgroundColor: done || current ? color : "transparent", borderWidth: 1.5, borderColor: color }} />
                {!vertical && i < items.length - 1 ? <View style={{ flex: 1, height: 1.5, backgroundColor: done ? C.steel : C.line }} /> : null}
              </View>
              <View style={{ paddingRight: 6, flex: vertical ? 1 : undefined }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.2, color: current ? C.brass : C.faint }}>R{it.n}{it.r?.sim_time ? ` · ${it.r.sim_time}` : ""}</Text>
                {done ? <Text numberOfLines={vertical ? 2 : 1} style={{ fontFamily: F.sans, fontSize: 11.5, color: C.muted }}>{it.r.title}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {sel ? (
        <View style={{ borderLeftWidth: 2, borderLeftColor: C.brass, paddingLeft: 10, gap: 3 }}>
          <Text style={{ fontFamily: F.sansMed, fontSize: 13, color: C.text }}>{sel.title}</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 18, color: C.muted }}>{sel.narrative}</Text>
        </View>
      ) : null}
    </View>
  );
}
