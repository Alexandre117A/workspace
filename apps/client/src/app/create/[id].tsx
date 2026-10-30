import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SessionParams } from "../../components/SessionParams";
import { Body, Btn, H1, Label, Loading, Notice, Panel, Screen, statusLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { useRequireAuth } from "../../lib/hooks";
import { C, S } from "../../theme";

/** Fiche d'un scénario (vue publique, sans secrets) et lancement d'une nouvelle session. */
export default function ScenarioDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useRequireAuth(`/create/${id}`);
  const [sc, setSc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState(4);
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user && id) api(`/scenarios/${id}`).then(setSc).catch((e) => setError(e.message));
  }, [user, id]);

  const launch = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sessionId: string }>("/sessions", { body: { scenarioId: id, teams, durationMinutes: duration } });
      router.replace(`/session/${r.sessionId}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!user) return null;
  if (!sc) return <Screen>{error ? <Notice tone="error">{error}</Notice> : <Loading />}</Screen>;
  return (
    <Screen max={900}>
      <View style={{ gap: S(5) }}>
        <Pressable onPress={() => router.back()}><Label>← Retour</Label></Pressable>
        <Label color={C.red}>Dossier de simulation</Label>
        <H1>{sc.title}</H1>
        <Body>{sc.summary}</Body>
        <Panel title={`${sc.actors.length} acteurs`}>
          {sc.actors.map((a: any) => (
            <Body key={a.id} style={{ fontSize: 14 }}>{a.name} <Body muted style={{ fontSize: 12 }}>— {a.kind} · {sc.setting.camps?.[a.camp] ?? a.camp}{a.leader ? ` · ${a.leader} (${statusLabel[a.leader_status] ?? a.leader_status})` : ""}</Body></Body>
          ))}
        </Panel>
        {sc.generation?.notes?.length ? <Panel title="Préparation">{sc.generation.notes.map((n: string) => <Body key={n} muted style={{ fontSize: 13 }}>{n}</Body>)}</Panel> : null}
        <SessionParams teams={teams} duration={duration} onTeams={setTeams} onDuration={setDuration} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Btn label="Ouvrir une session privée" onPress={launch} busy={busy} accent={C.red} />
      </View>
    </Screen>
  );
}
