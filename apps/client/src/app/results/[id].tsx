import { useEffect, useState } from "react";
import { Platform, Pressable, Share, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Cinematic } from "../../components/Cinematic";
import { Bar, Body, Btn, Chip, H1, H2, Label, Loading, Notice, Panel, Screen, useLayout } from "../../components/ui";
import { api } from "../../lib/api";
import { useRequireAuth } from "../../lib/hooks";
import { C, F, S } from "../../theme";

type Tab = "teams" | "timeline" | "communiques" | "cards" | "ignored";

export default function Results() {
  const { id, replay } = useLocalSearchParams<{ id: string; replay?: string }>();
  const user = useRequireAuth(`/results/${id}`);
  const { phone } = useLayout();
  const [a, setA] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [cinema, setCinema] = useState(replay !== "0");
  const [tab, setTab] = useState<Tab>("teams");
  const [team, setTeam] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let tries = 0;
    const load = () => api(`/archives/${id}`).then((d) => { setA(d); setTeam(d.teams[0]?.actor ?? null); }).catch((e) => {
      if (tries++ < 8) setTimeout(load, 800);
      else setError(e.message);
    });
    load();
  }, [user, id]);

  if (!user) return null;
  if (!a) return <Screen>{error ? <Notice tone="error">{error}</Notice> : <Loading label="Ouverture des archives" />}</Screen>;
  if (cinema) return <Cinematic source={{ theme: a.cinematic }} title={a.title} winner={a.winner ? `${a.winner.name} — ${a.winner.qualification}` : undefined} onDone={() => setCinema(false)} />;

  const playerOf = (actor: string) => a.players.find((p: any) => p.actor_id === actor);
  const president = a.players.find((p: any) => p.role === "president");
  const t = a.teams.find((x: any) => x.actor === team);
  const share = async () => {
    const lines = [`GEONEX — ${a.title}`, `Vainqueur : ${a.winner?.name ?? "—"} (${a.winner?.qualification ?? ""}, ${a.winner?.score}/100)`,
      ...a.ranking.map((r: any) => `${r.rank}. ${r.name} — ${r.total}/100`), `${a.rounds_played} rounds · ${a.sim_time_final}`];
    try { await Share.share({ message: lines.join("\n") }); } catch { /* annulé */ }
  };
  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const html = await fetchHtml(id);
      if (Platform.OS === "web") {
        const win = window.open("", "_blank");
        if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400); }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: a.title });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const again = async () => {
    setBusy("replay");
    try {
      const r = await api(`/archives/${id}/replay`, { method: "POST" });
      if (r.kind === "job") router.push({ pathname: "/prepare/[jobId]", params: { jobId: r.jobId, teams: "4", duration: "60" } });
      else router.push(`/session/${r.sessionId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ gap: S(6) }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.replace("/")}><Label>← Accueil</Label></Pressable>
          <Pressable onPress={() => setCinema(true)}><Label color={C.brass}>Revoir la séquence</Label></Pressable>
        </View>
        <View style={{ gap: S(2) }}>
          <Label color={C.red}>Dossier déclassifié · archive de simulation</Label>
          <H1>{a.title}</H1>
          <Label color={C.muted}>
            Durée réelle {Math.round((a.meta?.real_duration_seconds ?? 0) / 60)} min · {a.rounds_played} rounds · temps simulé final : {a.sim_time_final} · Président : {president?.display_name ?? a.meta?.president ?? "—"}
          </Label>
        </View>

        {a.winner ? (
          <View style={{ borderWidth: 1, borderColor: C.brass, backgroundColor: "#14110A", padding: S(6), gap: S(2) }}>
            <Label color={C.brass}>{a.winner.qualification}</Label>
            <Text style={{ fontFamily: F.title, fontSize: phone ? 38 : 56, color: C.text }}>{a.winner.name}</Text>
            <Body muted>{playerOf(a.winner.actor)?.display_name ?? ""} · indice final {a.winner.score}/100</Body>
          </View>
        ) : null}

        <Panel title="Classement">
          {a.ranking.map((r: any) => (
            <View key={r.actor} style={{ gap: 4, paddingVertical: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S(2) }}>
                <Text style={{ fontFamily: r.rank <= 3 ? F.sansBold : F.sans, color: C.text, fontSize: 16, flex: 1 }}>
                  {r.rank}. {r.name} <Text style={{ color: C.muted, fontSize: 13 }}>{playerOf(r.actor)?.display_name ?? ""}</Text>
                </Text>
                <Text style={{ fontFamily: F.monoBold, color: C.text }}>{r.total}/100</Text>
              </View>
              {r.qualification ? <Label color={C.brass}>{r.qualification}</Label> : null}
              <Bar value={r.total} color={r.rank === 1 ? C.brass : C.lineHi} height={4} />
              <Label color={C.faint}>Objectifs {r.components.objectives}/40 · position {r.components.position}/20 · capitaux {r.components.capital_management}/15 · cohérence {r.components.coherence}/15 · résilience {r.components.resilience}/10</Label>
            </View>
          ))}
          {a.mentions.map((m: any, i: number) => <Body key={i} style={{ fontSize: 14 }}><Text style={{ color: C.brass, fontFamily: F.sansBold }}>{m.mention}</Text> — {a.teams.find((x: any) => x.actor === m.actor)?.name ?? m.actor} : {m.reason}</Body>)}
        </Panel>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(2) }}>
          <Btn label="Partager la synthèse" variant="ghost" onPress={share} />
          <Btn label="Exporter le rapport (PDF)" variant="ghost" busy={busy === "pdf"} onPress={exportPdf} />
          <Btn label="Nouvelle simulation sur ce thème" busy={busy === "replay"} onPress={again} />
        </View>
        {error ? <Notice tone="error">{error}</Notice> : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(2) }}>
          {([["teams", "Dossiers des équipes"], ["timeline", "Chronologie"], ["communiques", "Communiqués de Rome"], ["cards", "Cartes utilisées"], ["ignored", "Ce que vous ignoriez"]] as [Tab, string][]).map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} color={k === "ignored" ? C.red : C.brass} />)}
        </View>

        {tab === "teams" ? (
          <View style={{ gap: S(4) }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(2) }}>{a.teams.map((x: any) => <Chip key={x.actor} label={x.name} active={team === x.actor} onPress={() => setTeam(x.actor)} color={C.steel} />)}</View>
            {t ? (
              <Panel title={`${t.rank}. ${t.name}${t.qualification ? " · " + t.qualification : ""}`} accent={C.steel}>
                <Body>{t.narrative}</Body>
                <Label>Objectifs</Label>
                {t.objectives.map((o: any) => (
                  <View key={o.id} style={{ gap: 3 }}>
                    <Body style={{ fontSize: 14 }}>{({ primary: "Principal", secondary: "Secondaire", coalition: "Coalition", secret: "Secret" } as any)[o.kind]} — {o.text}</Body>
                    <Bar value={o.progress * 100} color={o.progress >= 0.99 ? C.green : C.brass} height={3} />
                  </View>
                ))}
                <Label>Capitaux finaux</Label>
                <Body style={{ fontSize: 14 }}>Politique {Math.round(t.initial_capitals.political)} → {Math.round(t.final_capitals.political)} · Économique {Math.round(t.initial_capitals.economic)} → {Math.round(t.final_capitals.economic)} · Militaire {Math.round(t.initial_capitals.military)} → {Math.round(t.final_capitals.military)}</Body>
                <Label>Décisions principales ({t.successes} succès · {t.failures} échecs)</Label>
                {t.decisions.map((d: any, i: number) => <Body key={i} style={{ fontSize: 13.5 }}>R{d.round} · {d.category}{d.targets?.length ? ` → ${d.targets.join(", ")}` : ""} — <Text style={{ color: C.brass }}>{d.outcome}</Text>{d.intent ? <Text style={{ color: C.muted }}> · {d.intent}</Text> : null}</Body>)}
                {t.cards.length ? <><Label>Cartes</Label>{t.cards.map((c: any, i: number) => <Body key={i} style={{ fontSize: 13.5 }}>{c.card} (R{c.round}) — {c.result?.summary ?? c.result?.report?.finding ?? "—"}</Body>)}</> : null}
                <Label>Position stratégique finale : {t.final_position ?? "—"}e</Label>
              </Panel>
            ) : null}
          </View>
        ) : null}
        {tab === "timeline" ? a.timeline.map((r: any) => (
          <Panel key={r.round} title={`Round ${r.round} · ${r.sim_time_label}`}>
            <H2>{r.title}</H2>
            <Body style={{ fontSize: 14.5 }}>{r.narrative}</Body>
            {r.highlights?.map((h: string) => <Body key={h} muted style={{ fontSize: 13 }}>— {h}</Body>)}
          </Panel>
        )) : null}
        {tab === "communiques" ? (a.communiques.length ? a.communiques.map((c: any) => (
          <Panel key={c.id} title={`Round ${c.round} · ${c.origin === "president" ? "proposé par le Président" : "automatique"}`} accent={C.red}>
            <H2>{c.title}</H2>
            <Label color={C.muted}>{c.dateline}</Label>
            <Body style={{ fontSize: 14 }}>{c.body}</Body>
            <Body muted style={{ fontSize: 13 }}>{c.general_impact}</Body>
            <Label>Impact réel</Label>
            {Object.entries(c.real_impact).map(([actor, lines]: any) => <Body key={actor} style={{ fontSize: 12.5 }}>{actor} : {lines.join(" ; ")}</Body>)}
            {c.hidden_cause ? <Body style={{ fontSize: 13, color: C.amber }}>Cause : {c.hidden_cause}</Body> : null}
          </Panel>
        )) : <Body muted>Aucun Communiqué de Rome n'est intervenu.</Body>) : null}
        {tab === "cards" ? (a.cards.length ? a.cards.map((c: any, i: number) => (
          <Panel key={i} title={`${c.card} · ${c.actor_name} · round ${c.round}`}>
            <Body style={{ fontSize: 13.5 }}>{c.request}</Body>
            <Body muted style={{ fontSize: 13 }}>Moyens : {Object.entries(c.invest).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}</Body>
            <Body style={{ fontSize: 13.5, color: C.brass }}>{c.result?.summary ?? (c.result?.report ? `${c.result.report.finding} (fiabilité affichée ${c.result.report.reliability_pct} %)` : "—")}</Body>
          </Panel>
        )) : <Body muted>Aucune carte stratégique utilisée.</Body>) : null}
        {tab === "ignored" ? (
          <View style={{ gap: S(3) }}>
            <Body muted>Ce qui est resté confidentiel pendant la partie : véritables intentions, renseignements trompeurs, négociations secrètes, opérations et causes cachées.</Body>
            {a.ignored.map((x: any, i: number) => (
              <View key={i} style={{ borderLeftWidth: 2, borderLeftColor: C.red, paddingLeft: S(3), gap: 2 }}>
                <Label color={C.red}>{x.type}</Label>
                <Body style={{ fontSize: 14 }}>{x.text}</Body>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

async function fetchHtml(id: string): Promise<string> {
  const { API_URL, getToken } = await import("../../lib/api");
  const res = await fetch(`${API_URL}/api/archives/${id}/report.html`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error("Rapport indisponible.");
  return res.text();
}
