import { InvitePanel } from "../InvitePanel";
import { useState } from "react";
import { Platform, Pressable, Share, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Body, Btn, H1, Label, Notice, Panel, Screen, useLayout } from "../ui";
import { api } from "../../lib/api";
import { C, F, MODE_STYLE, S } from "../../theme";

/** Salon d'attente immersif : code, emblèmes, Président de séance, état de préparation. */
export function Lobby({ sessionId, lobby, connected }: { sessionId: string; lobby: any; connected: boolean }) {
  const { phone } = useLayout();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const s = lobby.session;
  const me = lobby.me;
  const teams = lobby.participants.filter((p: any) => p.role === "team");
  const president = lobby.participants.find((p: any) => p.role === "president");
  const connectedTeams = teams.filter((p: any) => p.connected).length;
  const mode = (lobby.scenario?.mode ?? "contemporary") as keyof typeof MODE_STYLE;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    await Clipboard.setStringAsync(s.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = async () => {
    const message = `Rejoignez la simulation GEONEX « ${s.name} » avec le code ${s.code}`;
    try {
      if (Platform.OS === "web" && !(navigator as any).share) return copy();
      await Share.share({ message });
    } catch { /* partage annulé */ }
  };

  return (
    <Screen>
      <View style={{ gap: S(6) }}>
        <View style={{ gap: S(2) }}>
          <Label color={MODE_STYLE[mode].accent}>{MODE_STYLE[mode].label} · session privée</Label>
          <H1>{s.name}</H1>
          {lobby.scenario?.summary ? <Body muted style={{ maxWidth: 820 }}>{lobby.scenario.summary}</Body> : null}
        </View>

        <View style={{ flexDirection: phone ? "column" : "row", gap: S(4) }}>
          <Panel title="Code de participation" accent={C.brass} style={{ flex: 1 }}>
            <Text selectable style={{ fontFamily: F.monoBold, fontSize: phone ? 30 : 40, letterSpacing: 6, color: C.text }}>{s.code}</Text>
            <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
              <Btn small label={copied ? "Copié" : "Copier"} onPress={copy} variant="ghost" />
              <Btn small label="Partager" onPress={share} variant="ghost" />
            </View>
            <Body muted style={{ fontSize: 13 }}>La session n'apparaît dans aucun catalogue public : seules les personnes disposant du code ou d'une invitation peuvent la rejoindre.</Body>
            {s.isCreator ? <InvitePanel sessionId={sessionId} /> : null}
          </Panel>
          <Panel title="État de préparation" style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", gap: S(6) }}>
              <View><Label>Attendues</Label><Text style={{ fontFamily: F.title, fontSize: 44, color: C.text }}>{s.expectedTeams}</Text></View>
              <View><Label>Connectées</Label><Text style={{ fontFamily: F.title, fontSize: 44, color: connectedTeams ? C.green : C.muted }}>{connectedTeams}</Text></View>
              <View><Label>Durée</Label><Text style={{ fontFamily: F.title, fontSize: 44, color: C.text }}>{s.durationMinutes}<Text style={{ fontSize: 18 }}> min</Text></Text></View>
            </View>
            {s.plan ? <Body muted style={{ fontSize: 13 }}>{s.plan.rounds_planned} rounds prévus · le moteur adaptera les acteurs et les phases au nombre d'équipes présentes au lancement.</Body> : null}
          </Panel>
        </View>

        <Panel title="Président de séance" accent={C.brass}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S(3) }}>
            <Text style={{ fontSize: 26, color: C.brass }}>{president?.emblem}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }}>{president?.displayName ?? "—"}</Text>
              <Label color={president?.connected ? C.green : C.faint}>{president?.connected ? "En ligne" : "Hors ligne"}{president?.id === me.participantId ? " · vous" : ""}</Label>
            </View>
          </View>
        </Panel>

        <View style={{ gap: S(3) }}>
          <Label>Délégations ({teams.length}/{s.expectedTeams})</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(3) }}>
            {teams.map((p: any) => (
              <View key={p.id} style={{ width: phone ? "100%" : 260, borderWidth: 1, borderColor: p.connected ? C.lineHi : C.line, backgroundColor: C.panel, padding: S(4), flexDirection: "row", gap: S(3), alignItems: "center" }}>
                <View style={{ width: 44, height: 44, borderWidth: 1, borderColor: p.connected ? C.steel : C.line, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 20, color: p.connected ? C.steel : C.faint }}>{p.emblem}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sansMed, fontSize: 15, color: C.text }}>{p.displayName}{p.id === me.participantId ? " (vous)" : ""}</Text>
                  <Label color={p.connected ? C.green : C.faint}>{p.connected ? "Présente" : "Absente"}</Label>
                </View>
                {me.role === "president" || s.isCreator ? (
                  <Pressable accessibilityRole="button" onPress={() => run(`t${p.id}`, () => api(`/sessions/${sessionId}/transfer-president`, { body: { participantId: p.id } }))}>
                    <Label color={C.brass}>Céder la présidence</Label>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {Array.from({ length: Math.max(0, s.expectedTeams - teams.length) }).map((_, i) => (
              <View key={`empty${i}`} style={{ width: phone ? "100%" : 260, borderWidth: 1, borderStyle: "dashed", borderColor: C.line, padding: S(4), minHeight: 78, justifyContent: "center" }}>
                <Label color={C.faint}>Délégation en attente</Label>
              </View>
            ))}
          </View>
        </View>

        <Panel title="Communications et confidentialité">
          <Body style={{ fontSize: 14 }}>
            Pour tenir compte de vos promesses, alliances et menaces, le moteur peut analyser le texte de vos échanges (déclarations publiques et
            communications privées). Les autres équipes n'y ont jamais accès. Sans votre accord, vos échanges ne sont pas analysés et ne pèsent pas
            dans la mémoire des engagements. Aucun enregistrement audio brut n'est conservé.
          </Body>
          <Btn small variant={me.consent ? "primary" : "ghost"} label={me.consent ? "Analyse autorisée — retirer" : "Autoriser l'analyse de mes échanges"}
            onPress={() => run("consent", async () => { await api(`/sessions/${sessionId}/consent`, { body: { consent: !me.consent } }); me.consent = !me.consent; })} />
        </Panel>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {!connected ? <Notice tone="warn">Connexion temps réel interrompue — reconnexion…</Notice> : null}
        {me.role === "president" ? (
          <View style={{ gap: S(2) }}>
            <Btn label="Lancer la partie" disabled={teams.length < 1} busy={busy === "start"} onPress={() => run("start", () => api(`/sessions/${sessionId}/start`, { method: "POST" }))} />
            <Body muted style={{ fontSize: 13 }}>{teams.length < s.expectedTeams ? `${s.expectedTeams - teams.length} délégation(s) manquent : vous pouvez attendre ou lancer avec les équipes présentes.` : "Toutes les délégations attendues sont présentes."}</Body>
          </View>
        ) : (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: S(3) }}>
            <Body muted>En attente du lancement par le Président de séance.</Body>
            <Btn small variant="quiet" label="Quitter le salon" onPress={() => run("leave", async () => { await api(`/sessions/${sessionId}/leave`, { method: "POST" }); })} />
          </View>
        )}
      </View>
    </Screen>
  );
}
