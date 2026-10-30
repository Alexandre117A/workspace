import { useEffect, useState } from "react";
import { View } from "react-native";
import { DURATION_RECOMMENDATION, MIN_DURATION_MINUTES, RECOMMENDED_DURATION_MINUTES } from "@geonex/shared";
import { api } from "../lib/api";
import { Body, Label, Notice, Panel, Stepper } from "./ui";
import { C, S } from "../theme";

/** Nombre d'équipes, durée (minimum 30 min) et aperçu réel du plan calculé par le moteur. */
export function SessionParams({ teams, duration, onTeams, onDuration }: { teams: number; duration: number; onTeams: (n: number) => void; onDuration: (n: number) => void }) {
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api("/scenarios/plan-preview", { body: { durationMinutes: duration, teams } })
        .then((r) => { setPlan(r.plan); setError(null); })
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [teams, duration]);
  const fmt = (s: number) => (s >= 60 ? `${Math.round(s / 60 * 10) / 10} min` : `${s} s`);
  return (
    <Panel title="Paramètres de la session">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(6) }}>
        <Stepper label="Équipes jouables" value={teams} min={1} max={16} onChange={onTeams} />
        <Stepper label="Durée totale" value={duration} min={MIN_DURATION_MINUTES} max={300} step={15} suffix="min" onChange={onDuration} />
      </View>
      <Body muted style={{ fontSize: 13.5 }}>Le Président de séance s'ajoute aux équipes : il arbitre, organise et contrôle le temps, sans représenter d'acteur.</Body>
      {duration < RECOMMENDED_DURATION_MINUTES ? <Notice tone="warn">{DURATION_RECOMMENDATION}</Notice> : <Notice>{DURATION_RECOMMENDATION}</Notice>}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {plan ? (
        <View style={{ gap: S(2) }}>
          <Label color={C.brass}>Déroulement calculé par le moteur</Label>
          <Body style={{ fontSize: 14 }}>
            {plan.rounds_planned} rounds · rythme {({ soutenue: "soutenu", standard: "standard", approfondie: "approfondi" } as any)[plan.intensity] ?? plan.intensity} · round ≈ {fmt(plan.round_seconds)} · Assemblée {fmt(plan.phase_seconds.assembly)} · Diplomatie {fmt(plan.phase_seconds.diplomacy)} · Décisions {fmt(plan.phase_seconds.decisions)}
          </Body>
          {plan.warnings.filter((w: string) => w !== DURATION_RECOMMENDATION).map((w: string) => <Notice key={w} tone="warn">{w}</Notice>)}
        </View>
      ) : null}
    </Panel>
  );
}
