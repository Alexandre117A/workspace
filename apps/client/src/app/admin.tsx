import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Body, Btn, H1, Label, Loading, Notice, Panel, Screen } from "../components/ui";
import { api } from "../lib/api";
import { useRequireAuth } from "../lib/hooks";
import { S } from "../theme";

/** Administration globale (rôle propriétaire uniquement, vérifié côté serveur). */
export default function Admin() {
  const user = useRequireAuth("/admin");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (user) api("/admin/overview").then(setData).catch((e) => setError(e.message));
  }, [user]);
  if (!user) return null;
  return (
    <Screen max={900}>
      <View style={{ gap: S(5) }}>
        <Pressable onPress={() => router.push("/space")}><Label>← Mon espace</Label></Pressable>
        <H1>Administration</H1>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!data && !error ? <Loading /> : null}
        {data ? (
          <>
            <Panel title="Utilisateurs"><Body>{data.users.accounts} comptes · {data.users.guests} profils invités</Body></Panel>
            <Panel title="Sessions">{data.sessions.map((s: any) => <Body key={s.status}>{s.status} : {s.n}</Body>)}</Panel>
            <Panel title="Consommation des services externes">
              {data.usage.map((u: any) => <Body key={u.service}>{u.service} : {Math.round(u.units)} unité(s) · {Number(u.cost || 0).toFixed(2)} $</Body>)}
              <Body>IA : {data.ai ? `${data.ai.calls} appels · ${data.ai.cost_usd.toFixed(3)} $ (processus moteur courant)` : "indisponible"}</Body>
            </Panel>
            
            <Moderation />
            <Panel title="Monétisation"><Body>Publicités : {data.monetization.ads.enabled ? "activées" : "désactivées (par défaut)"}</Body></Panel>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

/** Scénarios proposés à la bibliothèque publique (validation avant mise à disposition) et signalements des membres. */
function Moderation() {
  const [pending, setPending] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => { api("/admin/moderation/pending").then(setPending).catch(() => undefined); api("/admin/moderation/reports").then(setReports).catch(() => undefined); };
  useEffect(load, []);
  const decide = async (id: string, approve: boolean) => {
    try { await api(`/admin/moderation/pending/${id}`, { body: { approve, reason: approve ? undefined : "Non conforme aux règles de publication." } }); setMsg(approve ? "Scénario publié." : "Proposition refusée."); load(); }
    catch (e: any) { setMsg(e.message); }
  };
  return (
    <>
      <Panel title={`Propositions de scénarios (${pending.length})`}>
        {msg ? <Notice tone="info">{msg}</Notice> : null}
        {pending.length === 0 ? <Body muted>Aucune proposition en attente.</Body> : null}
        {pending.map((p) => (
          <View key={p.id} style={{ gap: S(2), borderTopWidth: 1, borderTopColor: "#1F3A58", paddingTop: S(3) }}>
            <Label>{p.mode} · proposé par {p.author}</Label>
            <Body>{p.publication?.title ?? p.title}</Body>
            <Body muted>{p.publication?.description ?? p.summary}</Body>
            <View style={{ flexDirection: "row", gap: S(2) }}><Btn small label="PUBLIER" onPress={() => decide(p.id, true)} /><Btn small variant="danger" label="REFUSER" onPress={() => decide(p.id, false)} /></View>
          </View>
        ))}
      </Panel>
      <Panel title={`Signalements (${reports.length})`}>
        {reports.length === 0 ? <Body muted>Aucun signalement ouvert.</Body> : null}
        {reports.map((r) => (
          <View key={r.id} style={{ gap: S(2), borderTopWidth: 1, borderTopColor: "#1F3A58", paddingTop: S(3) }}>
            <Label>{r.title} · signalé par {r.reporter ?? "—"}</Label>
            <Body muted>{r.reason}</Body>
            <View style={{ flexDirection: "row", gap: S(2) }}>
              <Btn small variant="danger" label="DÉPUBLIER LE SCÉNARIO" onPress={async () => { await api(`/admin/moderation/pending/${r.scenario_id}`, { body: { approve: false, reason: "Retiré après signalement." } }).catch(() => undefined); await api(`/admin/moderation/reports/${r.id}/close`, { body: {} }); load(); }} />
              <Btn small variant="ghost" label="CLASSER SANS SUITE" onPress={async () => { await api(`/admin/moderation/reports/${r.id}/close`, { body: {} }); load(); }} />
            </View>
          </View>
        ))}
      </Panel>
    </>
  );
}
