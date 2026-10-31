import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PHASE_LABELS } from "@geonex/shared";
import { Body, Btn, Chip, Field, Label, Notice, Stepper, useLayout } from "../ui";
import { Backdrop, Bar, Panel, Sheet } from "./hud";
import { AtlasBoard, AtlasMapBlock, AtlasSide, ContextStrip, useAtlas } from "../../atlas/AtlasWorkspace";
import { Ack, fmtClock, remaining, useNow } from "../../lib/game";
import { C, F, S } from "../../theme";
import { RoundMark, TopBar } from "./chrome";
import { Curve } from "../Curve";
import { ReportBody } from "./phases";
import { Situation } from "./Situation";

const name = (view: any, id: string | null | undefined) => view?.actors?.find((a: any) => a.id === id)?.name ?? id ?? "—";

function Requests({ game, emit }: { game: any; emit: (e: string, p?: unknown) => Promise<Ack> }) {
  const [prob, setProb] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const pending = game.requests.filter((r: any) => r.status === "pending");
  const done = game.requests.filter((r: any) => r.status !== "pending");
  const rule = async (id: string, approve: boolean) => {
    setError(null);
    const p = prob[id];
    const r = await emit("president:rule", { requestId: id, approve, probability: approve && p ? p / 100 : null });
    if (!r.ok) setError(r.error ?? "Refusé");
  };
  return (
    <Panel title={`Demandes à arbitrer (${pending.length})`} accent={pending.length ? C.amber : C.line}>
      {pending.length === 0 ? <Body muted style={{ fontSize: 13.5 }}>Aucune demande en attente.</Body> : null}
      {pending.map((r: any) => (
        <View key={r.id} style={{ gap: S(2), borderLeftWidth: 2, borderLeftColor: C.amber, paddingLeft: S(3) }}>
          <Label color={C.amber}>{name(game.view, r.actor_id)} · {({ decision: "Action incertaine", card: "Carte stratégique", note: "Note au Président" } as any)[r.kind]}</Label>
          <Body style={{ fontSize: 14 }}>{r.summary}</Body>
          {r.note ? <Body muted style={{ fontSize: 13 }}>Note : {r.note}</Body> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(2), alignItems: "flex-end" }}>
            <View style={{ gap: 4 }}>
              <Label>Probabilité d'aboutissement</Label>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                <Chip label="Laisser le moteur" active={!prob[r.id]} onPress={() => setProb({ ...prob, [r.id]: null })} />
                {[15, 30, 50, 70, 85].map((v) => <Chip key={v} label={`${v} %`} active={prob[r.id] === v} onPress={() => setProb({ ...prob, [r.id]: v })} />)}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: S(2) }}>
            <Btn small label="Accepter" onPress={() => rule(r.id, true)} />
            <Btn small variant="danger" label="Refuser" onPress={() => rule(r.id, false)} />
          </View>
        </View>
      ))}
      {done.length ? <Body muted style={{ fontSize: 12 }}>Traitées ce round : {done.map((r: any) => `${name(game.view, r.actor_id)} (${({ approved: "acceptée", refused: "refusée", timeout: "délai écoulé" } as any)[r.status]})`).join(", ")}</Body> : null}
      <Body muted style={{ fontSize: 12 }}>Vous fixez la probabilité, jamais le résultat : le tirage appartient au moteur, qui garde une part de l'évaluation.</Body>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Panel>
  );
}

function RomeComposer({ emit }: { emit: (e: string, p?: unknown) => Promise<Ack> }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<any>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const propose = async () => {
    setBusy(true);
    setIssues([]);
    const r = await emit("president:rome_propose", { text });
    setBusy(false);
    if (!r.ok) return setIssues([r.error ?? "Erreur"]);
    if (!r.data.coherent) return setIssues(r.data.issues);
    setDraft(r.data.draft);
  };
  const confirm = async (ok: boolean) => {
    const id = draft?.id;
    if (!id) return;
    setBusy(true);
    await emit("president:rome_confirm", { id, confirm: ok });
    setBusy(false);
    setDraft(null);
    if (ok) setText("");
  };
  return (
    <View style={{ gap: S(3) }}>
      <Body muted style={{ fontSize: 13.5 }}>Décrivez l'événement : le moteur vérifie sa cohérence avec l'univers et construit le communiqué (noms, lieux, chiffres, conséquences par équipe).</Body>
      <Field value={text} onChangeText={setText} multiline style={{ minHeight: 90 }} placeholder="Ex. Un pétrolier est arraisonné dans le détroit et son équipage retenu." />
      {issues.map((i) => <Notice key={i} tone="warn">{i}</Notice>)}
      {!draft ? <Btn label="Analyser la proposition" busy={busy} disabled={text.trim().length < 10} onPress={propose} accent={C.red} /> : (
        <Panel title="Communiqué construit par le moteur" accent={C.red}>
          <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }}>{draft.title}</Text>
          <Body style={{ fontSize: 14 }}>{draft.body}</Body>
          <Body muted style={{ fontSize: 13 }}>{draft.general_impact}</Body>
          <View style={{ flexDirection: "row", gap: S(2) }}>
            <Btn small label="Diffuser maintenant" accent={C.red} busy={busy} onPress={() => confirm(true)} />
            <Btn small variant="ghost" label="Abandonner" onPress={() => confirm(false)} />
          </View>
        </Panel>
      )}
    </View>
  );
}

/** Poste de commandement du Président de séance. */
export function PresidentPost({ game, emit, title }: { game: any; emit: (e: string, p?: unknown) => Promise<Ack>; title: string }) {
  const { width, desktop, phone } = useLayout();
  const now = useNow(500);
  const [sheet, setSheet] = useState<null | "rome" | "actors" | "report" | "situation">(null);
  const [speech, setSpeech] = useState(45);
  const [error, setError] = useState<string | null>(null);
  const { view, runtime, offset, lobby } = game;
  const { ctx, previous } = useAtlas(view);
  if (!view || !runtime) return null;
  const tb = view.true_balance;
  const colors = [C.steel, C.red, C.brass, C.green];
  const act = async (event: string, payload?: unknown) => {
    setError(null);
    const r = await emit(event, payload);
    if (!r.ok) setError(r.error ?? "Action refusée");
  };
  const a = runtime.assembly;
  const absent = (lobby?.participants ?? []).filter((p: any) => p.role === "team");
  const colW = desktop ? (Math.min(width, 1500) - S(16)) / 3 : width - S(8);

  const controls = (
    <Panel title={`${PHASE_LABELS[runtime.phase as keyof typeof PHASE_LABELS]} · round ${runtime.round}/${runtime.roundsPlanned}`} accent={C.brass}>
      {runtime.lastRound ? <Label color={C.red}>Dernier round annoncé</Label> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(2) }}>
        <Btn small label={runtime.paused ? "Reprendre la séance" : "Suspendre la séance"} onPress={() => act("president:pause", { paused: !runtime.paused })} />
        <Btn small variant="ghost" label="Proposer un Communiqué de Rome" accent={C.red} onPress={() => setSheet("rome")} />
        <Btn small variant="ghost" label="Dossier de situation" accent={C.steel} onPress={() => setSheet("situation")} />
      </View>
      {runtime.phase === "assembly" && a ? (
        <View style={{ gap: S(2) }}>
          <Label>Assemblée — {({ speech: "intervention", reaction: "réaction", rebuttal: "réplique" } as any)[a.mode] ?? a.mode} : {name(view, a.speaker)} ({fmtClock(remaining(a.deadline, offset, now))})</Label>
          <Btn small variant="ghost" label="Écourter l'intervention en cours" onPress={() => act("president:shorten", { target: "speech" })} />
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: S(2), flexWrap: "wrap" }}>
            <Stepper label="Durée max. des interventions suivantes" value={speech} min={15} max={60} step={5} suffix="s" onChange={setSpeech} />
            <Btn small variant="ghost" label="Appliquer" onPress={() => act("president:shorten", { target: "speech", seconds: speech })} />
          </View>
        </View>
      ) : null}
      {runtime.phase === "diplomacy" ? (
        <View style={{ gap: S(2) }}>
          <Body style={{ fontSize: 13.5 }}>{runtime.calls.length} communication(s) privée(s) en cours{runtime.calls.length ? ` : ${runtime.calls.map((c: any) => `${name(view, c.a)} ↔ ${name(view, c.b)}`).join(", ")}` : ""}. Leur contenu vous reste inaccessible.</Body>
          <Btn small variant="ghost" label="Réduire la Diplomatie à 1 minute" onPress={() => act("president:shorten", { target: "diplomacy", seconds: 60 })} />
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Panel>
  );

  const balance = (
    <Panel title="Rapport de force réel" accent={C.brass}>
      <View style={{ flexDirection: "row", height: 14 }}>
        {Object.entries(tb.shares as Record<string, number>).map(([k, v], i) => <View key={k} style={{ width: `${v}%`, backgroundColor: colors[i % 4] }} />)}
      </View>
      {Object.entries(tb.shares as Record<string, number>).map(([k, v], i) => <Body key={k} style={{ fontSize: 13.5 }}><Text style={{ color: colors[i % 4] }}>■ </Text>{tb.labels?.[k] ?? k} : {v} %</Body>)}
      {tb.leader_share >= 68 ? <Label color={C.red}>Zone de domination ({tb.leader_share} %) : le moteur peut préparer un Communiqué de Rome</Label> : null}
      <Curve width={Math.max(160, colW - 60)} height={90} min={20} max={80} series={Object.keys(tb.shares).map((k: string, i: number) => ({ color: colors[i % 4], values: tb.history.map((h: any) => (h.shares[k] ?? 0) * 100) }))} />
      <Label color={C.faint}>Part du camp dominant, round par round</Label>
    </Panel>
  );

  const actors = (
    <Panel title="Acteurs" right={<Text onPress={() => setSheet("actors")} style={{ color: C.brass, fontFamily: F.mono, fontSize: 11 }}>Détail ›</Text>}>
      <Label color={C.green}>Dominants</Label>
      {view.dominant.map((r: any) => <Body key={r.id} style={{ fontSize: 13.5 }}>{r.name} — indice {r.index}</Body>)}
      <Label color={C.red}>En difficulté</Label>
      {view.troubled.length ? view.troubled.map((t: any) => <Body key={t.id} style={{ fontSize: 13.5 }}>{t.name} — stabilité {Math.round(t.stability)}</Body>) : <Body muted style={{ fontSize: 13 }}>Aucun acteur en difficulté majeure.</Body>}
      {view.wars?.length ? <><Label color={C.amber}>États de guerre</Label>{view.wars.map((w: string[]) => <Body key={w.join()} style={{ fontSize: 13.5 }}>{name(view, w[0])} ↔ {name(view, w[1])}</Body>)}</> : null}
    </Panel>
  );

  const feed = (
    <Panel title="Évolutions stratégiques" right={game.report ? <Text onPress={() => setSheet("report")} style={{ color: C.brass, fontFamily: F.mono, fontSize: 11 }}>Rapport ›</Text> : null}>
      {view.all_events.slice(-14).reverse().map((e: any) => (
        <Body key={e.id} style={{ fontSize: 13 }}><Text style={{ color: e.scope === "public" ? C.muted : C.red }}>{e.scope === "public" ? "R" + e.round : "🔒R" + e.round} </Text>{e.title}</Body>
      ))}
      {game.messages.filter((m: any) => m.channel === "assembly").slice(-4).map((m: any) => <Body key={m.id} muted style={{ fontSize: 12.5 }}>« {m.text} » — {name(view, m.from)}</Body>)}
    </Panel>
  );

  const presence = (
    <Panel title="Délégations">
      {absent.map((p: any) => (
        <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S(2) }}>
          <Body style={{ fontSize: 13.5, flex: 1 }}>{p.emblem} {p.displayName} · {name(view, p.actorId)} <Text style={{ color: p.connected ? C.green : C.red }}>{p.connected ? "en ligne" : "absente"}</Text></Body>
          {!p.connected || p.absencePolicy === "npc" ? (
            <Btn small variant="ghost" label={p.absencePolicy === "npc" ? "Rendre la main" : "Confier au moteur"} onPress={() => act("president:absence", { participantId: p.id, policy: p.absencePolicy === "npc" ? "hold" : "npc" })} />
          ) : null}
        </View>
      ))}
      <Body muted style={{ fontSize: 12 }}>Absence prolongée : vous pouvez confier temporairement une délégation au moteur, puis lui rendre la main à son retour.</Body>
    </Panel>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop dense />
      <SafeAreaView style={{ flex: 1 }}>
        <TopBar title={`${title} · Présidence`} runtime={runtime} offset={offset} simTime={view.sim_time} connected={game.connected} strip={ctx ? <ContextStrip ctx={ctx} runtime={runtime} /> : null} />
        {desktop && ctx ? (() => {
          const gap = S(4), total = Math.min(width, 1800);
          const leftW = Math.round(Math.min(420, Math.max(340, total * 0.23))), rightW = Math.round(Math.min(420, Math.max(340, total * 0.24)));
          const centerW = Math.max(460, total - leftW - rightW - gap * 4);
          return (
            <View style={{ flex: 1, flexDirection: "row", gap, padding: gap, justifyContent: "center" }}>
              <View style={{ width: leftW }}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: S(4) }}>
                  {!game.connected ? <Notice tone="warn">Connexion interrompue — reconnexion…</Notice> : null}
                  {controls}<Requests game={game} emit={emit} />{presence}
                </ScrollView>
              </View>
              <View style={{ width: centerW }}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: S(4) }}>
                  <AtlasMapBlock ctx={ctx} view={view} width={centerW} height={Math.max(380, Math.round(centerW * 0.58))} />
                  {balance}
                  <View style={{ alignItems: "flex-end" }}><RoundMark round={runtime.round} /></View>
                </ScrollView>
              </View>
              <View style={{ width: rightW }}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: S(4) }}>
                  <AtlasSide ctx={ctx} view={view} previous={previous} width={rightW} />
                  {actors}{feed}
                </ScrollView>
              </View>
            </View>
          );
        })() : (
        <ScrollView contentContainerStyle={{ padding: S(4), gap: S(4), maxWidth: 1500, width: "100%", alignSelf: "center" }}>
          {!game.connected ? <Notice tone="warn">Connexion interrompue — reconnexion…</Notice> : null}
          {ctx ? <AtlasBoard view={view} ctx={ctx} previous={previous} width={Math.min(width, 1500) - S(8)} /> : null}
          <View style={{ flexDirection: desktop ? "row" : "column", gap: S(4), alignItems: "flex-start" }}>
            <View style={{ width: colW, gap: S(4) }}>{controls}<Requests game={game} emit={emit} />{presence}</View>
            <View style={{ width: colW, gap: S(4) }}>
              {balance}
            </View>
            <View style={{ width: colW, gap: S(4) }}>{actors}{feed}</View>
          </View>
          <View style={{ alignItems: "flex-end" }}><RoundMark round={runtime.round} /></View>
        </ScrollView>
        )}
      </SafeAreaView>
      <Sheet visible={sheet === "rome"} onClose={() => setSheet(null)} title="Communiqué de Rome — proposition" accent={C.red}><RomeComposer emit={emit} /></Sheet>
      <Sheet visible={sheet === "situation"} onClose={() => setSheet(null)} title="Dossier de situation" accent={C.steel} wide><Situation view={view} scenario={lobby?.scenario} /></Sheet>
      <Sheet visible={sheet === "report"} onClose={() => setSheet(null)} title="Rapport du round"><ReportBody report={game.report} view={view} /></Sheet>
      <Sheet visible={sheet === "actors"} onClose={() => setSheet(null)} title="Situation de tous les acteurs" wide>
        {view.actors_detail.map((a: any) => (
          <View key={a.id} style={{ gap: 4, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: S(2) }}>
            <Text style={{ fontFamily: F.sansBold, color: C.text }}>{a.name} <Text style={{ color: C.muted, fontFamily: F.mono, fontSize: 11 }}>{a.controlled_by === "human" ? "ÉQUIPE" : "SIMULÉ"} · {view.setting.camps?.[a.camp] ?? a.camp}</Text></Text>
            <View style={{ flexDirection: "row", gap: S(3) }}>
              {(["political", "economic", "military"] as const).map((k) => <View key={k} style={{ flex: 1, gap: 2 }}><Label>{k.slice(0, 3)}. {Math.round(a.capitals[k])}</Label><Bar value={a.capitals[k]} height={3} /></View>)}
            </View>
            <Body muted style={{ fontSize: 12 }}>Stabilité {Math.round(a.stability)} · approbation {Math.round(a.approval)} · cohésion {Math.round(a.cohesion)} · implication {Math.round(a.engagement * 100)} %</Body>
          </View>
        ))}
      </Sheet>
    </View>
  );
}
