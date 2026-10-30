import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Emblem } from "../../components/Brand";
import { Bar, Body, Btn, Label, Notice, Screen, useReducedMotion } from "../../components/ui";
import { api } from "../../lib/api";
import { useRequireAuth } from "../../lib/hooks";
import { C, F, S } from "../../theme";

/** Préparation réelle de l'univers : la progression reflète les étapes effectivement terminées par le moteur. */
export default function Prepare() {
  const { jobId, teams, duration } = useLocalSearchParams<{ jobId: string; teams: string; duration: string }>();
  const user = useRequireAuth("/");
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const created = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced, spin]);

  useEffect(() => {
    if (!user || !jobId) return;
    let alive = true;
    const tick = async () => {
      try {
        const j = await api(`/scenarios/jobs/${jobId}`);
        if (!alive) return;
        setJob(j);
        if (j.status === "done" && !created.current) {
          created.current = true;
          setCreating(true);
          const s = await api<{ sessionId: string }>("/sessions", { body: { scenarioId: j.scenarioId, teams: Number(teams ?? 4), durationMinutes: Number(duration ?? 60) } });
          router.replace(`/session/${s.sessionId}`);
          return;
        }
        if (j.status !== "failed") setTimeout(tick, 300);
      } catch (e: any) {
        if (alive) setError(e.message);
      }
    };
    tick();
    return () => { alive = false; };
  }, [user, jobId, teams, duration]);

  const cancel = async () => {
    try { await api(`/scenarios/jobs/${jobId}`, { method: "DELETE" }); } catch { /* déjà terminée */ }
    router.replace("/");
  };

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Screen max={760}>
      <View style={{ gap: S(6), paddingTop: S(6) }}>
        <View style={{ alignItems: "center", gap: S(4) }}>
          <Animated.View style={{ transform: [{ rotate }] }}><Emblem size={84} /></Animated.View>
          <Label color={C.brass}>Préparation de l'univers</Label>
          <Text style={{ fontFamily: F.title, fontSize: 30, color: C.text, textAlign: "center" }}>
            {job?.status === "failed" ? "Préparation interrompue" : creating ? "Ouverture de la session privée…" : "Le moteur construit votre simulation"}
          </Text>
        </View>
        <Bar value={(job?.progress ?? 0) * 100} color={job?.status === "failed" ? C.red : C.brass} height={3} />
        <View style={{ gap: S(3) }}>
          {(job?.steps ?? []).map((s: any) => (
            <View key={s.key} style={{ flexDirection: "row", gap: S(3), alignItems: "flex-start" }}>
              <Text style={{ width: 18, color: s.status === "done" ? C.green : s.status === "running" ? C.brass : C.faint, fontFamily: F.monoBold }}>
                {s.status === "done" ? "✓" : s.status === "running" ? "›" : "·"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sansMed, color: s.status === "pending" ? C.faint : C.text, fontSize: 15 }}>{s.label}</Text>
                {s.detail ? <Body muted style={{ fontSize: 12.5 }}>{s.detail}</Body> : null}
              </View>
            </View>
          ))}
        </View>
        {job?.elapsed !== undefined ? <Label color={C.faint}>Temps écoulé : {Math.round(job.elapsed)} s{job.target ? ` · délai visé ${job.target} s` : ""}</Label> : null}
        {job?.overdue ? <Notice tone="warn">La préparation prend plus de temps que prévu. Le moteur poursuit son travail ; rien n'est déclaré terminé tant qu'il ne l'est pas.</Notice> : null}
        {job?.status === "failed" ? <Notice tone="error">{job.error}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {job?.status === "failed" || error ? <Btn label="Revenir" onPress={() => router.back()} /> : <Btn label="Annuler la préparation" variant="ghost" onPress={cancel} />}
      </View>
    </Screen>
  );
}
