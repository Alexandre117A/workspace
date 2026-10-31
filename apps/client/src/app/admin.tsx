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
            <MailPanel />
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

/** État réel de l'envoi d'e-mails : fournisseur, expéditeur, connexion SMTP, résultats récents, et test vers l'adresse de l'administrateur. */
function MailPanel() {
  const [m, setM] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const load = () => api("/admin/mail").then(setM).catch((e) => setMsg({ tone: "error", text: e.message }));
  useEffect(() => { load(); }, []);
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<any>("/admin/mail/test", { body: {} });
      setMsg(r.status === "sent" ? { tone: "ok", text: `Message de test accepté par le fournisseur pour ${r.to}. Vérifiez la boîte de réception et les courriers indésirables.` }
        : r.status === "failed" ? { tone: "error", text: `Échec de l'envoi (${r.error ?? "erreur"}). Voir docs/EMAILS.md.` }
        : { tone: "warn", text: "Aucun message envoyé : aucun fournisseur SMTP n'est configuré sur ce serveur." });
      load();
    } catch (e: any) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="E-mails">
      {!m ? <Loading /> : (
        <>
          <Body>Fournisseur : {m.provider === "smtp" ? "SMTP" : m.provider === "log" ? "journal (développement, rien n'est envoyé)" : "aucun"} · État : {m.configured ? (m.verify?.ok ? "opérationnel" : `configuré, connexion en échec (${m.verify?.error ?? "?"})`) : "non configuré"}</Body>
          <Body muted>Expéditeur : {m.from ?? "—"} · Hôte : {m.host ?? "—"} · Adresse publique : {m.publicUrl}</Body>
          <Body muted>Sur 7 jours : {m.last7days.sent ?? 0} envoyé(s), {m.last7days.failed ?? 0} échec(s), {m.last7days.skipped ?? 0} non envoyé(s) (sans fournisseur)</Body>
          {m.problems.map((p: string) => <Notice key={p} tone="warn">{p}</Notice>)}
          {m.requireVerified && !m.configured ? <Notice tone="warn">L'adresse vérifiée est exigée par la configuration, mais la règle reste inactive tant que l'envoi d'e-mails ne fonctionne pas.</Notice> : null}
          {m.recentFailures.map((f: any, i: number) => <Body key={i} muted>Échec récent : {f.kind} · {f.error}</Body>)}
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <Btn small label="ENVOYER UN E-MAIL DE TEST À MON ADRESSE" busy={busy} onPress={test} />
        </>
      )}
    </Panel>
  );
}
