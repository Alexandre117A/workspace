import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { api } from "../lib/api";
import { useConfig, useRequireAuth } from "../lib/hooks";
import { C, F, MODE_STYLE, S } from "../theme";
import { SessionParams } from "./SessionParams";
import { Body, Btn, Field, H1, Label, Notice, Screen } from "./ui";

const EXAMPLES = {
  contemporary: ["Crise Chine–Taïwan", "Guerre entre l'Iran et les États-Unis", "Tensions Inde–Pakistan au Cachemire", "Blocus de la mer Baltique par la Russie"],
  historical: ["Crise des missiles de Cuba, octobre 1962", "Campagne d'Égypte de Napoléon en 1799", "Guerre de Cent Ans, 1415"],
};

/** Saisie libre (contemporain ou historique), paramètres, puis préparation réelle par le moteur. */
export function ScenarioRequest({ mode }: { mode: "contemporary" | "historical" }) {
  const user = useRequireAuth(`/${mode}`);
  const { cfg } = useConfig();
  const m = MODE_STYLE[mode];
  const [prompt, setPrompt] = useState("");
  const [teams, setTeams] = useState(4);
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async () => {
    setError(null);
    if (prompt.trim().length < 3) return setError("Décrivez la situation à simuler.");
    setBusy(true);
    try {
      const r = await api<{ jobId: string }>("/scenarios/jobs", { body: { mode, prompt: prompt.trim(), players: teams } });
      router.push({ pathname: "/prepare/[jobId]", params: { jobId: r.jobId, teams: String(teams), duration: String(duration) } });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  return (
    <Screen max={900}>
      <View style={{ gap: S(6) }}>
        <Pressable onPress={() => router.back()} accessibilityRole="link"><Label>← Accueil</Label></Pressable>
        <View style={{ gap: S(2) }}>
          <Label color={m.accent}>{m.code}</Label>
          <H1>{m.label}</H1>
        </View>
        <Field big value={prompt} onChangeText={setPrompt} maxLength={1500}
          placeholder={mode === "contemporary" ? "Quelle situation géopolitique souhaitez-vous simuler ?" : "Quel moment de l'histoire souhaitez-vous revivre ?"}
          accessibilityLabel="Situation à simuler" style={{ minHeight: 150, fontFamily: F.titleLight, fontSize: 24, lineHeight: 32 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(2) }}>
          {EXAMPLES[mode].map((ex) => (
            <Pressable key={ex} onPress={() => setPrompt(ex)} style={{ borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: C.muted, fontFamily: F.sans, fontSize: 13 }}>{ex}</Text>
            </Pressable>
          ))}
        </View>
        {cfg && !cfg.features.ai ? (
          <Notice tone="info">
            {mode === "contemporary"
              ? "Fournisseur IA non configuré : le moteur identifie les États cités et construit la situation à partir de sa table de référence (estimations) et, si le réseau le permet, de Wikipédia et Wikidata (sources datées)."
              : "Fournisseur IA non configuré : seules les bases historiques intégrées sont disponibles (Cuba 1962, Égypte 1799, Cent Ans 1415). La reconstitution libre de toute période nécessite la clé IA."}
          </Notice>
        ) : null}
        {mode === "historical" ? <Body muted style={{ fontSize: 13.5 }}>Aucun acteur ne connaîtra les événements postérieurs à la date de départ : l'histoire peut diverger dès le premier round.</Body> : null}
        <SessionParams teams={teams} duration={duration} onTeams={setTeams} onDuration={setDuration} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Btn label="Préparer la simulation" onPress={launch} busy={busy} accent={m.accent} />
      </View>
    </Screen>
  );
}
