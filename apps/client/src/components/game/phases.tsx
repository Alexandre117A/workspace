import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { DECISION_LABELS, DECISIONS_NEEDING_ARBITRATION, DECISIONS_NEEDING_TARGET, DecisionCategory, MAX_ALLOCATION_PER_DECISION, MAX_DECISIONS_PER_ROUND } from "@geonex/shared";
import { Body, Btn, Chip, Divider, Field, Label, Notice, Panel, Stepper } from "../ui";
import { Ack, fmtClock, remaining, useNow } from "../../lib/game";
import { VoiceChannel } from "./Voice";
import { C, F, S } from "../../theme";

export interface PhaseProps {
  view: any;
  runtime: any;
  offset: number;
  messages: any[];
  invites: any[];
  report: any;
  emit: (event: string, payload?: unknown) => Promise<Ack>;
  voice: boolean;
  sessionId: string;
  openDossier: () => void;
  openCards: () => void;
}

const name = (view: any, id: string | null | undefined) => view?.actors?.find((a: any) => a.id === id)?.name ?? id ?? "—";

function useAction(emit: PhaseProps["emit"]) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, event: string, payload?: unknown) => {
    setBusy(key);
    setError(null);
    const r = await emit(event, payload);
    if (!r.ok) setError(r.error ?? "Action refusée");
    setBusy(null);
    return r;
  };
  return { busy, error, run, setError };
}

export function ReadyBlock({ p, label = "Prêt" }: { p: PhaseProps; label?: string }) {
  const me = p.view?.me?.id;
  const ready = p.runtime.ready?.includes(me);
  const { busy, run } = useAction(p.emit);
  return (
    <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap", alignItems: "center" }}>
      <Btn label={ready ? "Prêt — en attente des autres équipes" : label} disabled={ready} busy={busy === "ready"} onPress={() => run("ready", "ready")} />
      {!ready ? <Btn label="Passer" variant="ghost" onPress={() => run("ready", "ready")} /> : null}
    </View>
  );
}

export function DossierPhase({ p }: { p: PhaseProps }) {
  return (
    <View style={{ gap: S(4) }}>
      <Body>Prenez connaissance de votre dossier confidentiel : objectifs, lignes rouges, capitaux et moyens. Il ne contient aucune consigne stratégique.</Body>
      <Btn variant="ghost" label="Rouvrir mon dossier" onPress={p.openDossier} />
      <ReadyBlock p={p} label="J'ai pris connaissance" />
    </View>
  );
}

export function BriefingPhase({ p }: { p: PhaseProps }) {
  const round = p.runtime.round;
  const publicEvents = (p.view?.events ?? []).filter((e: any) => e.round === round - 1).slice(-6);
  const mine = (p.view?.private_events ?? []).filter((e: any) => e.round === round - 1).slice(-5);
  const lastRound = p.view?.rounds?.find((r: any) => r.round === round - 1);
  return (
    <View style={{ gap: S(4) }}>
      {round === 1 ? <Body>Premier round. La situation de départ est figée : à partir de maintenant, le monde évolue selon vos décisions.</Body> : null}
      {lastRound ? <Panel title={`Synthèse du round ${lastRound.round}`}><Body style={{ fontSize: 14 }}>{lastRound.narrative}</Body></Panel> : null}
      {publicEvents.length ? (
        <Panel title="Informations publiques">
          {publicEvents.map((e: any) => <Body key={e.id} style={{ fontSize: 14 }}><Text style={{ fontFamily: F.sansBold }}>{e.title}</Text> {e.text !== e.title ? `— ${e.text}` : ""}</Body>)}
        </Panel>
      ) : null}
      {mine.length ? (
        <Panel title="Informations confidentielles" accent={C.red}>
          {mine.map((e: any) => <Body key={e.id} style={{ fontSize: 14 }}><Text style={{ fontFamily: F.sansBold }}>{e.title}</Text> — {e.text}</Body>)}
        </Panel>
      ) : null}
      <ReadyBlock p={p} />
    </View>
  );
}

export function AssemblyPhase({ p }: { p: PhaseProps }) {
  const now = useNow(250);
  const a = p.runtime.assembly;
  const me = p.view?.me?.id;
  const [text, setText] = useState("");
  const { busy, error, run } = useAction(p.emit);
  const feed = p.messages.filter((m) => m.channel === "assembly").slice(-30);
  const scroll = useRef<any>(null);
  useEffect(() => { scroll.current?.scrollToEnd({ animated: true }); }, [feed.length]);
  if (!a) return <ActivityIndicator color={C.brass} />;
  const speaking = a.speaker === me && (a.mode === "speech" || a.mode === "rebuttal");
  const left = remaining(a.deadline, p.offset, now);
  const used = a.rebuttalsUsed?.[me] ?? 0;
  const maxReb = p.view?.plan?.assembly?.max_rebuttals_per_team ?? 0;
  const modeLabel = { speech: "Intervention", reaction: "Fenêtre de réaction", rebuttal: "Réplique", transition: "Transition", idle: "—" }[a.mode as string];
  return (
    <View style={{ gap: S(4) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View style={{ gap: 4 }}>
          <Label color={C.brass}>{modeLabel}</Label>
          <Text style={{ fontFamily: F.title, fontSize: 26, color: C.text }}>{a.speaker ? name(p.view, a.speaker) : "—"}{a.speaker === me ? " (vous)" : ""}</Text>
        </View>
        <Text style={{ fontFamily: F.monoBold, fontSize: 26, color: (left ?? 0) < 10000 ? C.red : C.text }}>{fmtClock(left)}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {a.queue.map((id: string, i: number) => <Text key={id} style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, borderWidth: 1, borderColor: C.line, paddingHorizontal: 6, paddingVertical: 3 }}>{i + 1}. {name(p.view, id)}</Text>)}
      </View>
      <View style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2, maxHeight: 230 }}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: S(3), gap: S(2) }}>
          {feed.length === 0 ? <Body muted style={{ fontSize: 13 }}>Les déclarations publiques apparaîtront ici, en direct pour toutes les délégations.</Body> : null}
          {feed.map((m) => (
            <View key={m.id}>
              <Label color={m.from === me ? C.brass : C.steel}>{name(p.view, m.from)}{m.mode === "rebuttal" ? " · réplique" : ""}</Label>
              <Body style={{ fontSize: 14 }}>{m.text}</Body>
            </View>
          ))}
        </ScrollView>
      </View>
      {p.voice ? <VoiceChannel sessionId={p.sessionId} channel="assembly" enabled speaking={speaking} roomKey={`${p.runtime.round}:${a.speaker}:${a.mode}`} /> : <Label color={C.faint}>Canal vocal non configuré : interventions écrites, diffusées à tous</Label>}
      {speaking ? (
        <View style={{ gap: S(2) }}>
          <Field value={text} onChangeText={setText} placeholder="Votre déclaration publique" multiline style={{ minHeight: 70 }} />
          <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
            <Btn label="Déclarer" disabled={!text.trim()} busy={busy === "say"} onPress={async () => { const r = await run("say", "assembly:statement", { text }); if (r.ok) setText(""); }} />
            <Btn label="Terminer mon intervention" variant="ghost" busy={busy === "end"} onPress={() => run("end", "assembly:end")} />
          </View>
        </View>
      ) : a.mode === "reaction" && a.speaker !== me ? (
        <Btn label={a.floorRequests?.includes(me) ? "Demande de parole enregistrée" : `Demander la parole (${Math.max(0, maxReb - used)} réplique(s) restante(s))`}
          disabled={a.floorRequests?.includes(me) || used >= maxReb} busy={busy === "floor"} onPress={() => run("floor", "assembly:floor")} />
      ) : (
        <Body muted style={{ fontSize: 13 }}>Vous ne pouvez pas interrompre l'orateur. Une fenêtre de réaction de 7 secondes s'ouvre après chaque intervention.</Body>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

export function DiplomacyPhase({ p }: { p: PhaseProps }) {
  const now = useNow(250);
  const me = p.view?.me?.id;
  const { busy, error, run } = useAction(p.emit);
  const [text, setText] = useState("");
  const call = p.runtime.calls?.find((c: any) => c.a === me || c.b === me);
  const other = call ? (call.a === me ? call.b : call.a) : null;
  const incoming = (p.runtime.invites ?? []).filter((i: any) => i.to === me);
  const outgoing = (p.runtime.invites ?? []).filter((i: any) => i.from === me);
  const humans = (p.view?.actors ?? []).filter((a: any) => a.controlled_by === "human" && a.id !== me);
  const busyActors: string[] = p.runtime.busy ?? [];
  const done = p.runtime.diplomacyDone?.includes(me);
  const feed = call ? p.messages.filter((m) => m.channel === `call:${call.id}`) : [];
  const lastResp = p.invites.filter((i) => i.from === me && i.response).slice(-1)[0];
  return (
    <View style={{ gap: S(4) }}>
      {call ? (
        <Panel title={`Communication privée — ${name(p.view, other)}`} accent={C.steel} right={<Text style={{ fontFamily: F.monoBold, color: C.text }}>{fmtClock(remaining(call.deadline, p.offset, now))}</Text>}>
          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: S(2) }}>
            {feed.map((m, i) => (
              <View key={m.id ?? i}>
                {m.system ? <Label color={C.faint}>{m.text}</Label> : <><Label color={m.from === me ? C.brass : C.steel}>{name(p.view, m.from)}</Label><Body style={{ fontSize: 14 }}>{m.text}</Body></>}
              </View>
            ))}
          </ScrollView>
          <Field value={text} onChangeText={setText} placeholder="Votre message (strictement privé)" onSubmitEditing={async () => { if (text.trim() && (await run("msg", "diplomacy:message", { text })).ok) setText(""); }} />
          <View style={{ flexDirection: "row", gap: S(2) }}>
            <Btn small label="Envoyer" disabled={!text.trim()} busy={busy === "msg"} onPress={async () => { if ((await run("msg", "diplomacy:message", { text })).ok) setText(""); }} />
            <Btn small variant="danger" label="Raccrocher" onPress={() => call && run("hang", "diplomacy:hangup", { callId: call.id })} />
          </View>
          {p.voice ? <VoiceChannel sessionId={p.sessionId} channel="call" enabled speaking roomKey={call.id} /> : null}
          <Label color={C.faint}>Aucune autre délégation ne peut lire ou entendre cet échange. {p.voice ? "" : "Canal vocal non configuré : échange écrit."}</Label>
        </Panel>
      ) : null}
      {incoming.map((inv: any) => (
        <Panel key={inv.id} title="Invitation reçue" accent={C.brass}>
          <Body>{name(p.view, inv.from)} propose une communication privée (1 min max). Réponse avant {fmtClock(remaining(inv.expiresAt, p.offset, now))}.</Body>
          <View style={{ flexDirection: "row", gap: S(2) }}>
            <Btn small label="Accepter" onPress={() => run("acc", "diplomacy:respond", { inviteId: inv.id, accept: true })} />
            <Btn small variant="ghost" label="Refuser" onPress={() => run("dec", "diplomacy:respond", { inviteId: inv.id, accept: false })} />
          </View>
        </Panel>
      ))}
      {!call ? (
        <View style={{ gap: S(2) }}>
          <Label>Délégations</Label>
          {humans.map((h: any) => {
            const pending = outgoing.some((i: any) => i.to === h.id);
            const occupied = busyActors.includes(h.id);
            return (
              <View key={h.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: C.line, padding: S(3), backgroundColor: C.panel }}>
                <View>
                  <Text style={{ fontFamily: F.sansMed, color: C.text, fontSize: 15 }}>{h.name}</Text>
                  <Label color={occupied ? C.amber : C.faint}>{occupied ? "En communication" : pending ? "Invitation envoyée" : "Disponible"}</Label>
                </View>
                <Btn small label="Proposer un échange" disabled={pending || occupied} onPress={() => run(`inv${h.id}`, "diplomacy:invite", { target: h.id })} busy={busy === `inv${h.id}`} />
              </View>
            );
          })}
          {humans.length === 0 ? <Body muted>Aucune autre délégation humaine dans cette session.</Body> : null}
          {lastResp?.response === "declined" ? <Notice tone="warn">{name(p.view, lastResp.to)} a décliné votre invitation.</Notice> : null}
          {lastResp?.response === "expired" ? <Notice tone="warn">Invitation à {name(p.view, lastResp.to)} restée sans réponse.</Notice> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
        <Btn variant="ghost" label="Cartes stratégiques" onPress={p.openCards} />
        <Btn label={done ? "Diplomatie terminée — en attente" : "J'ai terminé la Diplomatie"} disabled={done} onPress={() => run("done", "diplomacy:done")} />
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

interface Draft {
  id: string;
  category: DecisionCategory;
  targets: string[];
  zone: string | null;
  intent: string;
  allocation: { political: number; economic: number; military: number };
  resources: Record<string, number>;
  secret: boolean;
  note: string;
}
const newDraft = (): Draft => ({ id: Math.random().toString(36).slice(2, 10), category: "diplomatic_initiative", targets: [], zone: null, intent: "", allocation: { political: 5, economic: 0, military: 0 }, resources: {}, secret: false, note: "" });

export function DecisionsPhase({ p }: { p: PhaseProps }) {
  const me = p.view?.me;
  const [drafts, setDrafts] = useState<Draft[]>([newDraft()]);
  const { busy, error, run } = useAction(p.emit);
  const submitted = p.runtime.submitted?.includes(me?.id);
  const others = (p.view?.actors ?? []).filter((a: any) => a.id !== me?.id);
  const spent = useMemo(() => drafts.reduce((acc, d) => ({ political: acc.political + d.allocation.political, economic: acc.economic + d.allocation.economic, military: acc.military + d.allocation.military }), { political: 0, economic: 0, military: 0 }), [drafts]);
  const update = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const submit = () => run("submit", "decisions:submit", {
    decisions: drafts.map((d) => ({
      id: d.id, category: d.category, targets: d.targets, zone: d.zone, intent: d.intent, allocation: d.allocation, secret: d.secret || d.category === "covert_operation",
      resources: Object.entries(d.resources).filter(([, q]) => q > 0).map(([key, quantity]) => ({ key, quantity })), ...(d.note.trim() ? { note: d.note.trim() } : {}),
    })),
  });
  if (!me) return null;
  return (
    <View style={{ gap: S(4) }}>
      <Body muted style={{ fontSize: 13.5 }}>Jusqu'à {MAX_DECISIONS_PER_ROUND} décisions. Les capitaux engagés sont dépensés ; certaines ressources sont consommées ou immobilisées plusieurs rounds. Vous pouvez modifier et renvoyer vos décisions jusqu'à la fin de la phase.</Body>
      <Label color={C.faint}>Engagé ce round — politique {spent.political}/{Math.round(me.capitals.political)} · économique {spent.economic}/{Math.round(me.capitals.economic)} · militaire {spent.military}/{Math.round(me.capitals.military)}</Label>
      {drafts.map((d, i) => (
        <Panel key={d.id} title={`Décision ${i + 1}`} accent={DECISIONS_NEEDING_ARBITRATION.includes(d.category) ? C.amber : C.brass}
          right={drafts.length > 1 ? <Pressable onPress={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}><Label color={C.red}>Retirer</Label></Pressable> : null}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(DECISION_LABELS) as DecisionCategory[]).map((c) => <Chip key={c} label={DECISION_LABELS[c]} active={d.category === c} onPress={() => update(i, { category: c })} />)}
          </View>
          {DECISIONS_NEEDING_TARGET.includes(d.category) || d.category === "information_campaign" || d.category === "humanitarian" ? (
            <View style={{ gap: 6 }}>
              <Label>Cible</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {others.map((a: any) => <Chip key={a.id} label={a.name} active={d.targets.includes(a.id)} onPress={() => update(i, { targets: d.targets.includes(a.id) ? [] : [a.id] })} color={C.steel} />)}
              </View>
            </View>
          ) : null}
          {["military_deployment", "military_strike"].includes(d.category) && p.view?.zones?.length ? (
            <View style={{ gap: 6 }}>
              <Label>Zone</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {p.view.zones.map((z: any) => <Chip key={z.id} label={z.name} active={d.zone === z.id} onPress={() => update(i, { zone: d.zone === z.id ? null : z.id })} color={C.red} />)}
              </View>
            </View>
          ) : null}
          <Field value={d.intent} onChangeText={(t) => update(i, { intent: t })} placeholder="Décrivez précisément votre objectif, votre cible et les moyens que vous souhaitez engager." multiline style={{ minHeight: 70 }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>
            {(["political", "economic", "military"] as const).map((k) => (
              <Stepper key={k} label={{ political: "Capital politique", economic: "Capital économique", military: "Capital militaire" }[k]} value={d.allocation[k]} min={0}
                max={Math.min(MAX_ALLOCATION_PER_DECISION, Math.floor(me.capitals[k]))} step={1} onChange={(v) => update(i, { allocation: { ...d.allocation, [k]: v } })} />
            ))}
          </View>
          <View style={{ gap: 6 }}>
            <Label>Ressources engagées</Label>
            {me.resources.filter((r: any) => r.usable && r.available > 0).map((r: any) => (
              <View key={r.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S(2) }}>
                <Body style={{ fontSize: 13.5, flex: 1 }}>{r.label} <Text style={{ color: C.muted }}>({r.available} {r.unit} disponibles)</Text></Body>
                <Stepper value={d.resources[r.key] ?? 0} min={0} max={Math.floor(r.available)} onChange={(v) => update(i, { resources: { ...d.resources, [r.key]: v } })} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S(2) }}>
            <Switch value={d.secret || d.category === "covert_operation"} onValueChange={(v) => update(i, { secret: v })} disabled={d.category === "covert_operation"} />
            <Body style={{ fontSize: 13.5 }}>Action discrète (non annoncée publiquement)</Body>
          </View>
          <Field value={d.note} onChangeText={(t) => update(i, { note: t })} placeholder="Note au Président de séance (facultatif) : action recherchée, objectif, cibles, ressources proposées." />
          {DECISIONS_NEEDING_ARBITRATION.includes(d.category) ? <Notice tone="warn">Cette action sera soumise à l'arbitrage du Président de séance, qui peut l'accepter, la refuser ou lui attribuer une probabilité d'aboutissement.</Notice> : null}
        </Panel>
      ))}
      {drafts.length < MAX_DECISIONS_PER_ROUND ? <Btn variant="ghost" label="Ajouter une décision" onPress={() => setDrafts((ds) => [...ds, { ...newDraft(), allocation: { political: 0, economic: 0, military: 0 } }])} /> : null}
      <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
        <Btn label={submitted ? "Renvoyer mes décisions" : "Transmettre mes décisions"} busy={busy === "submit"} onPress={submit} />
        <Btn variant="ghost" label="Cartes stratégiques" onPress={p.openCards} />
      </View>
      {submitted ? <Notice tone="ok">Décisions transmises au moteur. Vous pouvez encore les modifier jusqu'à la fin de la phase.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

export function WaitPhase({ text }: { text: string }) {
  return (
    <View style={{ alignItems: "center", gap: S(4), paddingVertical: S(8) }}>
      <ActivityIndicator color={C.brass} />
      <Body muted style={{ textAlign: "center" }}>{text}</Body>
    </View>
  );
}

export function ReportBody({ report, view }: { report: any; view: any }) {
  if (!report) return <Body muted>Aucun rapport pour l'instant.</Body>;
  const pv = report.private;
  const lbl = { political: "Politique", economic: "Économique", military: "Militaire" } as const;
  return (
    <View style={{ gap: S(4) }}>
      {report.public ? (
        <Panel title={`Situation publique · ${report.public.sim_time_label ?? ""}`}>
          <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }}>{report.public.title}</Text>
          <Body style={{ fontSize: 14 }}>{report.public.narrative}</Body>
          {report.public.highlights?.map((h: string) => <Body key={h} muted style={{ fontSize: 13 }}>— {h}</Body>)}
        </Panel>
      ) : null}
      {pv ? (
        <>
          <Panel title="Évolution de vos capitaux" accent={C.brass}>
            {(["political", "economic", "military"] as const).map((k) => {
              const c = pv.capital_changes[k];
              return (
                <View key={k} style={{ gap: 2 }}>
                  <Text style={{ fontFamily: F.sansBold, color: C.text }}>{lbl[k]} : {c.before} → {c.after} <Text style={{ color: c.delta >= 0 ? C.green : C.red }}>({c.delta >= 0 ? "+" : ""}{c.delta})</Text></Text>
                  {c.reasons.slice(0, 4).map((r: any, i: number) => <Body key={i} muted style={{ fontSize: 12.5 }}>{r.delta >= 0 ? "+" : ""}{r.delta} · {r.reason}</Body>)}
                </View>
              );
            })}
          </Panel>
          {pv.decisions?.length ? <Panel title="Vos décisions">{pv.decisions.map((d: any) => <Body key={d.decision_id} style={{ fontSize: 14 }}>{d.summary}</Body>)}</Panel> : null}
          {pv.rejected?.length ? <Notice tone="warn">Décision(s) écartée(s) : {pv.rejected.map((r: any) => r.errors.join(" ")).join(" ; ")}</Notice> : null}
          {pv.cards?.length ? <Panel title="Cartes stratégiques" accent={C.red}>{pv.cards.map((c: any, i: number) => <Body key={i} style={{ fontSize: 14 }}><Text style={{ fontFamily: F.sansBold }}>{c.label}</Text> — {c.result?.report ? `${c.result.report.finding} (fiabilité ${c.result.report.reliability_pct} % · ${c.result.report.confidence_label})` : c.result?.summary}</Body>)}</Panel> : null}
          {pv.events?.length ? <Panel title="Situation intérieure">{pv.events.map((e: any, i: number) => <Body key={i} style={{ fontSize: 14 }}><Text style={{ fontFamily: F.sansBold }}>{e.title}</Text> — {e.text}</Body>)}</Panel> : null}
          {pv.commitments?.length ? <Panel title="Engagements">{pv.commitments.map((c: any, i: number) => <Body key={i} style={{ fontSize: 13.5 }}>{c.kind} avec {name(view, c.with)} : {({ honored: "tenu", broken: "rompu", expired: "non tenu", open: "en cours" } as any)[c.status]}</Body>)}</Panel> : null}
        </>
      ) : null}
      {report.president ? (
        <Panel title="Vision du Président" accent={C.brass}>
          {report.president.major?.slice(0, 10).map((e: any, i: number) => <Body key={i} style={{ fontSize: 13.5 }}>{e.scope !== "public" ? "🔒 " : ""}{e.title}</Body>)}
        </Panel>
      ) : null}
    </View>
  );
}

export function ConsequencesPhase({ p }: { p: PhaseProps }) {
  return (
    <View style={{ gap: S(4) }}>
      <ReportBody report={p.report} view={p.view} />
      <Divider />
      <ReadyBlock p={p} label="Continuer" />
    </View>
  );
}
