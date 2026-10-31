import { ReactNode, useCallback, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { passwordIssues, pseudonymIssues } from "@geonex/shared";
import { InvitePanel } from "../components/InvitePanel";
import { LibraryCard } from "../components/LibraryCard";
import { Avatar, PageScreen } from "../components/Page";
import { PublishForm } from "../components/PublishForm";
import { Btn, Field, Loading, Notice, useLayout } from "../components/ui";
import { api } from "../lib/api";
import { cleanMessage, useAuth } from "../lib/auth";
import { useRequireAuth } from "../lib/hooks";
import { MODE_NAMES } from "../lib/library";
import { C, F, MODE_STYLE, S } from "../theme";

type Tab = "overview" | "simulations" | "participations" | "active" | "saved" | "invitations" | "profile" | "settings";
const TABS: [Tab, string][] = [["overview", "Vue d'ensemble"], ["simulations", "Mes simulations"], ["participations", "Mes participations"], ["active", "Sessions en cours"], ["saved", "Scénarios enregistrés"], ["invitations", "Invitations"], ["profile", "Mon profil"], ["settings", "Paramètres"]];
const STATUS_COLOR: Record<string, string> = { preparing: C.amber, active: C.green, finished: C.steel, expired: C.faint, archived: C.faint };
const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 2 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : fmt(d); };

function Card({ children, accent = C.lineHi, tone = "dark" }: { children: ReactNode; accent?: string; tone?: "dark" | "ivory" }) {
  return <View style={{ backgroundColor: tone === "ivory" ? "#F3F0E9" : C.panel, borderWidth: 1, borderColor: tone === "ivory" ? "#D7CFBA" : C.lineHi, borderTopWidth: 2, borderTopColor: accent, padding: S(4), gap: S(2) }}>{children}</View>;
}
const H = ({ children, sub }: { children: string; sub?: string }) => (
  <View style={{ gap: 4, marginBottom: S(1) }}>
    <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: 28, color: C.text, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } }}>{children}</Text>
    {sub ? <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.muted }}>{sub}</Text> : null}
  </View>
);
function Chip({ text, color }: { text: string; color: string }) {
  return <View style={{ borderWidth: 1, borderColor: color, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start" }}><Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.4, color, textTransform: "uppercase" }}>{text}</Text></View>;
}
function Empty({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: C.lineHi, backgroundColor: C.bg2 + "D9", padding: S(7), gap: S(3), alignItems: "center" }}>
      <Text style={{ fontFamily: F.title, fontSize: 24, color: C.text, textAlign: "center" }}>{title}</Text>
      <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 21, color: C.muted, textAlign: "center", maxWidth: 460 }}>{text}</Text>
      {action ? <Btn label={action} onPress={onAction!} /> : null}
    </View>
  );
}
function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ flexDirection: "row", gap: S(3), alignItems: "flex-start", paddingVertical: 6 }}>
      <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: value ? C.atlas : C.line, padding: 3, alignItems: value ? "flex-end" : "flex-start", marginTop: 2 }}><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: value ? C.text : C.muted }} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontFamily: F.sansMed, fontSize: 14.5, color: C.text }}>{label}</Text>{hint ? <Text style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 18, color: C.muted }}>{hint}</Text> : null}</View>
    </Pressable>
  );
}

function SessionCard({ s, kind, onChange }: { s: any; kind: "own" | "part" | "active"; onChange: () => void }) {
  const [invite, setInvite] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = MODE_STYLE[s.scenario.mode as keyof typeof MODE_STYLE];
  const own = kind === "own" || (kind === "active" && s.relation === "Organisateur");
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); onChange(); } catch (e: any) { setErr(cleanMessage(e.message)); } };
  const live = s.status.key === "active" || s.status.key === "preparing";
  return (
    <Card accent={m.accent}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.8, color: m.accent, textTransform: "uppercase" }}>{MODE_NAMES[s.scenario.mode as keyof typeof MODE_NAMES]}{s.scenario.startLabel ? ` · ${s.scenario.startLabel}` : ""}</Text>
        <Chip text={s.status.label} color={STATUS_COLOR[s.status.key] ?? C.muted} />
      </View>
      <Text style={{ fontFamily: F.title, fontSize: 23, color: C.text }}>{s.name}</Text>
      <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>Scénario : {s.scenario.title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: C.faint }}>
        {kind === "part" ? `Rôle : ${s.role} · Organisateur : ${s.organizer} · rejoint le ${fmt(s.joinedAt)}` : kind === "active" ? `${s.relation} · ${s.role} · ` : `Créée le ${fmt(s.createdAt)} · `}
        {kind !== "part" ? `${s.participants} participant${s.participants > 1 ? "s" : ""}${s.round ? ` · tour ${s.round}${s.roundsPlanned ? `/${s.roundsPlanned}` : ""}` : ""} · activité ${ago(s.lastActivity)}` : ""}
      </Text>
      {s.code ? <Text selectable style={{ fontFamily: F.monoBold, fontSize: 16, letterSpacing: 3, color: C.brass }}>Code : {s.code}</Text> : null}
      {err ? <Notice tone="error">{err}</Notice> : null}
      <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap", marginTop: S(1) }}>
        {live ? <Btn small label={kind === "part" ? "REJOINDRE LA SESSION" : kind === "active" ? "CONTINUER" : "REPRENDRE"} onPress={() => router.push(`/session/${s.id}`)} /> : null}
        {s.status.key === "finished" ? <Btn small label="VOIR LES RÉSULTATS" onPress={() => router.push(`/results/${s.id}`)} /> : null}
        {own && s.rawStatus === "lobby" ? <Btn small variant="ghost" label={invite ? "FERMER LES INVITATIONS" : "INVITER"} onPress={() => setInvite(!invite)} /> : null}
        {own && kind === "own" && !s.archived && !live ? <Btn small variant="ghost" label="ARCHIVER" onPress={() => act(() => api(`/space/sessions/${s.id}/archive`, { body: {} }))} /> : null}
        {own && kind === "own" && s.archived ? <Btn small variant="ghost" label="DÉSARCHIVER" onPress={() => act(() => api(`/space/sessions/${s.id}/unarchive`, { body: {} }))} /> : null}
        {own && kind === "own" && (s.rawStatus === "lobby" || s.rawStatus === "expired") ? (confirm
          ? <Btn small variant="danger" label="CONFIRMER LA SUPPRESSION" onPress={() => act(() => api(`/space/sessions/${s.id}`, { method: "DELETE" }))} />
          : <Btn small variant="quiet" label="SUPPRIMER" onPress={() => setConfirm(true)} />) : null}
      </View>
      {confirm ? <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>La suppression retire cette session de l'attente, y compris pour les joueurs déjà arrivés. Une session jouée ne peut qu'être archivée.</Text> : null}
      {invite ? <InvitePanel sessionId={s.id} /> : null}
    </Card>
  );
}

function ScenarioRow({ sc, onChange }: { sc: any; onChange: () => void }) {
  const [pub, setPub] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const st = sc.publication_status as string;
  return (
    <Card accent={MODE_STYLE[sc.mode as keyof typeof MODE_STYLE]?.accent}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.8, color: C.faint, textTransform: "uppercase" }}>{MODE_NAMES[sc.mode as keyof typeof MODE_NAMES]} · créé le {fmt(sc.created_at)}</Text>
        <Chip text={st === "published" ? "Publié" : st === "pending" ? "En attente de validation" : st === "rejected" ? "Refusé" : "Privé"} color={st === "published" ? C.green : st === "pending" ? C.amber : st === "rejected" ? C.red : C.muted} />
      </View>
      <Text style={{ fontFamily: F.title, fontSize: 21, color: C.text }}>{sc.title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: C.faint }}>{sc.start_label ?? ""} · {Number(sc.sessions)} session{Number(sc.sessions) > 1 ? "s" : ""} lancée{Number(sc.sessions) > 1 ? "s" : ""}</Text>
      {st === "rejected" && sc.rejection_reason ? <Notice tone="warn">Publication refusée : {sc.rejection_reason}</Notice> : null}
      {err ? <Notice tone="error">{err}</Notice> : null}
      <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
        <Btn small label="CRÉER UNE SESSION" onPress={() => router.push({ pathname: "/create/[id]", params: { id: sc.id } })} />
        {st === "pending" || st === "published" ? <Btn small variant="ghost" label="RETIRER DE LA BIBLIOTHÈQUE" onPress={async () => { try { await api(`/publications/${sc.id}`, { method: "DELETE" }); onChange(); } catch (e: any) { setErr(cleanMessage(e.message)); } }} />
          : <Btn small variant="ghost" label={pub ? "FERMER" : "PROPOSER À LA BIBLIOTHÈQUE"} onPress={() => setPub(!pub)} />}
      </View>
      {pub ? <PublishForm scenario={{ id: sc.id, title: sc.title }} onDone={() => { setPub(false); onChange(); }} /> : null}
    </Card>
  );
}

function Profile({ me, reload }: { me: any; reload: () => void }) {
  const auth = useAuth();
  const [pseudo, setPseudo] = useState(me.displayName);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const say = (tone: "ok" | "error" | "info", text: string) => setMsg({ tone, text });
  const run = async (fn: () => Promise<string | void>) => { setMsg(null); try { const t = await fn(); if (t) say("ok", t); } catch (e: any) { say("error", cleanMessage(e.message)); } };

  if (me.isGuest) {
    return (
      <Card><H sub="Un profil invité n'est pas protégé par un mot de passe et peut disparaître.">Profil invité</H>
        <Btn label="CRÉER UN COMPTE GRATUIT" onPress={() => router.push("/auth?mode=register")} /></Card>
    );
  }
  return (
    <View style={{ gap: S(4) }}>
      <Card accent={C.brass}>
        <View style={{ flexDirection: "row", gap: S(4), alignItems: "center", flexWrap: "wrap" }}>
          <Avatar name={me.displayName} color={me.avatarColor} size={64} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontFamily: F.title, fontSize: 28, color: C.text }}>{me.displayName}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 12.5, color: C.muted }}>{me.email}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: C.faint }}>Inscrit le {fmt(me.createdAt)}{me.role === "owner" ? " · administrateur" : ""}</Text>
          </View>
        </View>
      </Card>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Card><H>Identité</H>
        <Field label="Pseudonyme" value={pseudo} onChangeText={setPseudo} maxLength={24} autoCapitalize="none" hint="Votre identité publique dans les simulations. Lettres, chiffres, point, tiret, tiret bas." />
        <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2, color: C.faint, textTransform: "uppercase" }}>Avatar (monogramme)</Text>
        <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
          {["navy", "atlas", "brass", "red", "stone"].map((c) => (
            <Pressable key={c} accessibilityRole="radio" accessibilityState={{ checked: me.avatarColor === c }} accessibilityLabel={`Couleur ${c}`} onPress={() => run(async () => { const r = await api<any>("/auth/profile", { method: "PATCH", body: { avatarColor: c } }); await auth.replaceToken(r.token); reload(); })}
              style={{ padding: 3, borderWidth: 2, borderColor: me.avatarColor === c ? C.brass : "transparent" }}><Avatar name={me.displayName} color={c} size={34} /></Pressable>
          ))}
        </View>
        <Btn small label="ENREGISTRER LE PSEUDONYME" disabled={pseudo === me.displayName} onPress={() => run(async () => {
          const issues = pseudonymIssues(pseudo); if (issues.length) throw new Error(issues[0]);
          const r = await api<any>("/auth/profile", { method: "PATCH", body: { pseudonym: pseudo } }); await auth.replaceToken(r.token); reload(); return "Pseudonyme mis à jour.";
        })} />
      </Card>
      <Card><H sub="Adresse de connexion uniquement : GEONEX n'envoie aucun e-mail. Le changement est immédiat.">Adresse e-mail</H>
        <Field label="Nouvelle adresse" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Mot de passe actuel" value={emailPw} onChangeText={setEmailPw} secureTextEntry autoCapitalize="none" />
        <Btn small label="CHANGER D'ADRESSE" disabled={!email.includes("@") || !emailPw} onPress={() => run(async () => { await api("/auth/email", { body: { email: email.trim().toLowerCase(), password: emailPw } }); setEmail(""); setEmailPw(""); reload(); return "Adresse de connexion modifiée."; })} />
      </Card>
      <Card><H sub="Changer de mot de passe déconnecte vos autres appareils.">Mot de passe</H>
        <Field label="Mot de passe actuel" value={cur} onChangeText={setCur} secureTextEntry autoCapitalize="none" />
        <Field label="Nouveau mot de passe" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" hint="10 caractères au moins, avec une lettre et un chiffre." />
        <Field label="Confirmation" value={conf} onChangeText={setConf} secureTextEntry autoCapitalize="none" />
        <Btn small label="CHANGER LE MOT DE PASSE" disabled={!cur || !next} onPress={() => run(async () => {
          if (passwordIssues(next).length) throw new Error("Votre mot de passe ne respecte pas les exigences de sécurité.");
          if (next !== conf) throw new Error("Les mots de passe ne correspondent pas.");
          const r = await api<any>("/auth/password", { body: { current: cur, next } }); await auth.replaceToken(r.token); setCur(""); setNext(""); setConf(""); return "Mot de passe modifié.";
        })} />
      </Card>
      <Card><H sub="Déconnecte tous les appareils, y compris celui-ci si vous le souhaitez ensuite.">Sessions de connexion</H>
        <Btn small variant="ghost" label="DÉCONNECTER TOUS LES AUTRES APPAREILS" onPress={() => run(async () => { const r = await api<any>("/auth/logout-all", { body: {} }); await auth.replaceToken(r.token); return "Les autres appareils sont déconnectés."; })} />
        <Btn small variant="quiet" label="ME DÉCONNECTER" onPress={async () => { await auth.logout(); router.replace("/"); }} />
      </Card>
    </View>
  );
}

function Settings({ me, reload }: { me: any; reload: () => void }) {
  const auth = useAuth();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (body: any) => { try { await api("/auth/profile", { method: "PATCH", body }); reload(); } catch (e: any) { setMsg(cleanMessage(e.message)); } };
  if (me.isGuest) return <Empty title="Paramètres du compte" text="Créez un compte pour gérer vos notifications et votre confidentialité." action="CRÉER UN COMPTE" onAction={() => router.push("/auth?mode=register")} />;
  return (
    <View style={{ gap: S(4) }}>
      <Card><H>Notifications</H>
        <Toggle label="Invitations à une simulation" hint="Notification dans votre espace quand un joueur vous invite ou répond à votre invitation." value={me.notifications?.invitations !== false} onChange={(v) => save({ notifications: { invitations: v } })} />
        <Toggle label="Actualités de la plateforme" hint="Désactivé par défaut. GEONEX n'envoie aucun e-mail, ni newsletter ni message commercial." value={!!me.notifications?.product} onChange={(v) => save({ notifications: { product: v } })} />
      </Card>
      <Card><H>Confidentialité</H>
        <Toggle label="Pouvoir être invité par mon pseudonyme" hint="Si vous le désactivez, un organisateur ne peut plus vous trouver par votre pseudonyme (les liens et le code de participation restent possibles)." value={me.discoverable !== false} onChange={(v) => save({ discoverable: v })} />
        <Text style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 19, color: C.muted }}>Données conservées : adresse e-mail, pseudonyme, mot de passe (empreinte chiffrée, jamais en clair), parties jouées et préférences. Aucune publicité, aucune revente.</Text>
        <Btn small variant="ghost" label="LIRE LA POLITIQUE DE CONFIDENTIALITÉ" onPress={() => router.push("/privacy")} />
      </Card>
      <Card accent={C.redDeep}><H sub="Action définitive. Vos favoris, invitations et préférences sont effacés ; vos scénarios non utilisés sont supprimés. Une partie jouée avec d'autres participants reste dans leurs archives, sous le nom « Compte supprimé ». Impossible tant que vous organisez une session en cours.">Supprimer mon compte</H>
        {confirm ? (
          <>
            <Field label="Confirmez avec votre mot de passe" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" />
            <Btn small variant="danger" label="SUPPRIMER DÉFINITIVEMENT MON COMPTE" disabled={!pw} onPress={async () => { try { await api("/auth/me", { method: "DELETE", body: { password: pw } }); await auth.logout(); router.replace("/"); } catch (e: any) { setMsg(cleanMessage(e.message)); } }} />
          </>
        ) : <Btn small variant="quiet" label="SUPPRIMER MON COMPTE" onPress={() => setConfirm(true)} />}
        {msg ? <Notice tone="error">{msg}</Notice> : null}
      </Card>
    </View>
  );
}

/** MON ESPACE GEONEX : simulations, participations, sessions en cours, scénarios enregistrés, invitations, profil et paramètres. */
export default function Space() {
  const user = useRequireAuth("/space");
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { phone, desktop } = useLayout();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const tab: Tab = (TABS.find(([k]) => k === tabParam)?.[0] ?? "overview") as Tab;
  const setTab = (t: Tab) => router.setParams({ tab: t });
  const load = useCallback(async () => { try { setError(null); setData(await api("/space/overview")); } catch (e: any) { setError(cleanMessage(e.message)); } }, []);
  useEffect(() => { if (user) load(); }, [user?.id, load]);
  useEffect(() => { if (data && tab === "invitations" && data.unread) api("/space/notifications/read", { body: {} }).catch(() => undefined); }, [tab, data?.unread]);
  if (!user) return null;
  const me = data?.me;
  const respond = async (id: string, accept: boolean) => {
    try { const r = await api<{ sessionId: string }>(`/space/invitations/${id}/${accept ? "accept" : "decline"}`, { body: {} }); if (accept) router.push(`/session/${r.sessionId}`); else load(); }
    catch (e: any) { setNote(cleanMessage(e.message)); load(); }
  };

  const body = (() => {
    if (error) return <Notice tone="error">{error} <Text onPress={load} style={{ textDecorationLine: "underline" }}>Réessayer</Text></Notice>;
    if (!data) return <Loading label="Ouverture de votre espace" />;
    const mySessions = data.mySessions.filter((s: any) => archived || !s.archived);
    const pending = data.invitations.filter((i: any) => i.status === "pending");
    switch (tab) {
      case "simulations": return (
        <View style={{ gap: S(4) }}>
          <H sub="Les parties que vous organisez.">Mes simulations</H>
          {mySessions.length ? mySessions.map((s: any) => <SessionCard key={s.id} s={s} kind="own" onChange={load} />) : <Empty title="Votre espace stratégique commence ici." text="Vous n'avez pas encore créé de simulation. Concevez votre premier scénario et commencez à explorer les grandes décisions géopolitiques." action="CRÉER MA PREMIÈRE SIMULATION" onAction={() => setChooser(true)} />}
          {data.mySessions.some((s: any) => s.archived) ? <Btn small variant="ghost" label={archived ? "MASQUER LES SESSIONS ARCHIVÉES" : "AFFICHER LES SESSIONS ARCHIVÉES"} onPress={() => setArchived(!archived)} /> : null}
          {data.scenarios.length ? <><H sub="Privés par défaut : vous seul les voyez, sauf si vous les proposez à la bibliothèque.">Mes scénarios</H>{data.scenarios.map((sc: any) => <ScenarioRow key={sc.id} sc={sc} onChange={load} />)}</> : null}
        </View>);
      case "participations": return (
        <View style={{ gap: S(4) }}>
          <H sub="Les simulations auxquelles vous participez sans les avoir créées.">Mes participations</H>
          {data.participations.length ? data.participations.map((s: any) => <SessionCard key={s.id} s={s} kind="part" onChange={load} />) : <Empty title="Aucune participation pour le moment." text="Rejoignez une session avec un code de participation ou acceptez une invitation : elle apparaîtra ici." action="REJOINDRE AVEC UN CODE" onAction={() => router.push("/")} />}
        </View>);
      case "active": return (
        <View style={{ gap: S(4) }}>
          <H sub="Reprenez une simulation en quelques secondes.">Sessions en cours</H>
          {data.active.length ? data.active.map((s: any) => <SessionCard key={s.id} s={s} kind="active" onChange={load} />) : <Empty title="Aucune session en cours." text="Vos sessions actives, organisées ou rejointes, apparaissent ici avec un accès direct." action="EXPLORER LES SCÉNARIOS" onAction={() => router.push("/library")} />}
        </View>);
      case "saved": return (
        <View style={{ gap: S(4) }}>
          <H sub="Les scénarios que vous avez conservés dans la bibliothèque.">Scénarios enregistrés</H>
          {data.favorites.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>{data.favorites.map((f: any) => <LibraryCard key={f.key} item={{ ...f, favorite: true }} width={phone ? 320 : 330} reload={load} compact />)}</View>
            : <Empty title="Aucun scénario enregistré pour le moment." text="Explorez la bibliothèque GEONEX et conservez les scénarios qui vous intéressent." action="EXPLORER LES SCÉNARIOS" onAction={() => router.push("/library")} />}
        </View>);
      case "invitations": return (
        <View style={{ gap: S(4) }}>
          <H sub="Les invitations à rejoindre une simulation.">Invitations</H>
          {note ? <Notice tone="warn">{note}</Notice> : null}
          {data.invitations.length ? data.invitations.map((i: any) => (
            <Card key={i.id} accent={i.status === "pending" ? C.brass : C.lineHi}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.8, color: C.faint, textTransform: "uppercase" }}>Invitation de {i.from} · {ago(i.createdAt)}</Text>
                <Chip text={{ pending: "En attente", accepted: "Acceptée", declined: "Refusée", revoked: "Révoquée", expired: "Expirée" }[i.status as string] ?? i.status} color={i.status === "pending" ? C.amber : i.status === "accepted" ? C.green : C.faint} />
              </View>
              <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }}>{i.session.name}</Text>
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>{i.session.scenario} · {i.session.status.label}</Text>
              {i.status === "pending" ? <View style={{ flexDirection: "row", gap: S(2) }}><Btn small label="ACCEPTER" onPress={() => respond(i.id, true)} /><Btn small variant="ghost" label="REFUSER" onPress={() => respond(i.id, false)} /></View> : null}
            </Card>
          )) : <Empty title="Aucune invitation en attente." text="Les invitations à rejoindre une simulation apparaîtront ici." />}
        </View>);
      case "profile": return <Profile me={me} reload={() => { load(); }} />;
      case "settings": return <Settings me={me} reload={load} />;
      default: return (
        <View style={{ gap: S(5) }}>
          {me?.isGuest ? <Notice tone="warn">Vous utilisez un profil invité temporaire. <Text onPress={() => router.push("/auth?mode=register")} style={{ textDecorationLine: "underline" }}>Créez un compte gratuit</Text> pour conserver vos simulations, favoris et invitations.</Notice> : null}
          {pending.length ? <Card accent={C.brass}><H sub={`${pending.length} invitation${pending.length > 1 ? "s" : ""} en attente`}>Invitations</H>{pending.slice(0, 2).map((i: any) => <View key={i.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S(3), flexWrap: "wrap" }}><Text style={{ fontFamily: F.sans, fontSize: 14, color: C.text, flex: 1 }}>{i.from} vous invite à « {i.session.name} »</Text><Btn small label="VOIR" onPress={() => setTab("invitations")} /></View>)}</Card> : null}
          <View style={{ gap: S(3) }}>
            <H sub="Vos sessions actives, organisées ou rejointes.">Sessions en cours</H>
            {data.active.length ? data.active.slice(0, 3).map((s: any) => <SessionCard key={s.id} s={s} kind="active" onChange={load} />) : <Empty title="Votre espace stratégique commence ici." text="Aucune session en cours. Concevez votre premier scénario ou rejoignez une session pour commencer à explorer les grandes décisions géopolitiques." action="CRÉER MA PREMIÈRE SIMULATION" onAction={() => setChooser(true)} />}
          </View>
          {data.favorites.length ? <View style={{ gap: S(3) }}><H>Derniers scénarios enregistrés</H><View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>{data.favorites.slice(0, 3).map((f: any) => <LibraryCard key={f.key} item={{ ...f, favorite: true }} width={330} reload={load} compact />)}</View></View> : null}
        </View>);
    }
  })();

  const counts: Partial<Record<Tab, number>> = data ? { simulations: data.mySessions.filter((s: any) => !s.archived).length, participations: data.participations.length, active: data.active.length, saved: data.favorites.length, invitations: data.invitations.filter((i: any) => i.status === "pending").length } : {};
  const nav = (
    <ScrollView horizontal={!desktop} showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: desktop ? "column" : "row", gap: desktop ? 2 : 6 }} accessibilityRole="tablist">
      {TABS.map(([k, label]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)}
          style={({ hovered }: any) => ({ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderLeftWidth: desktop ? 3 : 0, borderBottomWidth: desktop ? 0 : 2, borderColor: tab === k ? C.brass : "transparent", backgroundColor: tab === k ? "#B89A5D1A" : hovered ? "#FFFFFF0A" : "transparent" })}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.5, color: tab === k ? C.brass : C.muted, textTransform: "uppercase" }}>{label}</Text>
          {counts[k] ? <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, color: tab === k ? C.brass : C.faint }}>{counts[k]}</Text> : null}
        </Pressable>
      ))}
    </ScrollView>
  );

  return (
    <PageScreen>
      <View style={{ gap: S(3), marginBottom: S(6) }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.6, color: C.brass, textTransform: "uppercase" }}>Mon espace GEONEX</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S(4), flexWrap: "wrap" }}>
          <Avatar name={user.displayName} color={me?.avatarColor ?? user.avatarColor} size={phone ? 46 : 60} />
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 32 : 46, lineHeight: phone ? 36 : 50, color: C.text, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>BON RETOUR, {user.displayName.toUpperCase()}</Text>
            <Text style={{ fontFamily: F.titleItalic, fontSize: phone ? 17 : 20, color: "#D9D4C6", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } }}>Retrouvez vos simulations, vos scénarios et votre activité géopolitique.</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: S(3), flexWrap: "wrap" }}>
          <Btn label="NOUVELLE SIMULATION" onPress={() => setChooser(!chooser)} />
          <Btn variant="ghost" label="EXPLORER LES SCÉNARIOS" onPress={() => router.push("/library")} />
        </View>
        {chooser ? (
          <View style={{ flexDirection: "row", gap: S(3), flexWrap: "wrap", backgroundColor: C.bg2 + "F2", borderWidth: 1, borderColor: C.lineHi, padding: S(3) }}>
            {([["contemporary", "/contemporary"], ["historical", "/historical"], ["fictional", "/create"]] as const).map(([k, href]) => (
              <Pressable key={k} accessibilityRole="link" onPress={() => router.push(href as any)} style={({ hovered }: any) => ({ flex: 1, minWidth: 200, borderWidth: 1, borderColor: hovered ? MODE_STYLE[k].accent : C.line, padding: S(3), gap: 4 })}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 2, color: MODE_STYLE[k].accent }}>{MODE_STYLE[k].code}</Text>
                <Text style={{ fontFamily: F.title, fontSize: 20, color: C.text }}>{MODE_STYLE[k].label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: desktop ? "row" : "column", gap: S(6), alignItems: "flex-start" }}>
        <View style={{ width: desktop ? 250 : "100%", backgroundColor: desktop ? C.bg2 + "F2" : "transparent", borderWidth: desktop ? 1 : 0, borderColor: C.line, borderBottomWidth: desktop ? 1 : 1, borderBottomColor: C.line }}>{nav}</View>
        <View style={{ flex: 1, width: "100%" }}>{body}</View>
      </View>
    </PageScreen>
  );
}
