import { Text, View } from "react-native";
import { statusLabel } from "../ui";
import { DocLabel, DocRule, DocText, DocTitle, usePaper } from "./Envelope";
import { F, S } from "../../theme";

const KIND = { primary: "Objectif principal", secondary: "Objectif secondaire", coalition: "Objectif de coalition", secret: "Objectif secret" } as const;

/** Dossier confidentiel de départ : court, informatif, sans conseil stratégique. */
export function DossierContent({ d }: { d: any }) {
  const p = usePaper();
  const cap = (label: string, v: number) => (
    <View style={{ flex: 1, minWidth: 90, gap: 4 }}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1.6, color: p.accent }}>{label}</Text>
      <Text style={{ fontFamily: F.title, fontSize: 34, color: p.ink }}>{Math.round(v)}<Text style={{ fontSize: 15 }}>/100</Text></Text>
    </View>
  );
  return (
    <View style={{ gap: S(4) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: S(3) }}>
        <DocLabel>{d.classification}</DocLabel>
        <DocLabel>{d.camp}</DocLabel>
      </View>
      <DocTitle>{d.actor.name}</DocTitle>
      {d.actor.leader ? <DocText small>Direction : {d.actor.leader} <Text style={{ opacity: 0.6 }}>({statusLabel[d.actor.leader_status] ?? d.actor.leader_status})</Text></DocText> : null}
      {d.actor.description ? <DocText small>{d.actor.description}</DocText> : null}
      <DocRule />
      <View style={{ gap: S(2) }}>
        {d.objectives.map((o: any, i: number) => (
          <View key={i} style={{ gap: 2 }}>
            <DocLabel>{KIND[o.kind as keyof typeof KIND] ?? o.kind}</DocLabel>
            <DocText>{o.text}</DocText>
          </View>
        ))}
      </View>
      <DocRule />
      <DocLabel>Lignes rouges</DocLabel>
      {d.red_lines.map((r: string) => <DocText key={r}>— {r}</DocText>)}
      <DocRule />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(3) }}>
        {cap("CAPITAL POLITIQUE", d.capitals.political)}
        {cap("CAPITAL ÉCONOMIQUE", d.capitals.economic)}
        {cap("CAPITAL MILITAIRE", d.capitals.military)}
      </View>
      <DocText small>Stabilité intérieure {Math.round(d.indicators.stability)}/100 · cohésion nationale {Math.round(d.indicators.cohesion)}/100 · approbation du gouvernement {Math.round(d.indicators.approval)}/100 <Text style={{ opacity: 0.6 }}>({statusLabel[d.indicators.source?.status] ?? ""})</Text></DocText>
      <DocLabel>Moyens</DocLabel>
      <View style={{ gap: 2 }}>
        {d.resources.map((r: any) => (
          <DocText key={r.label} small>
            {r.label} : <Text style={{ fontFamily: F.monoBold }}>{r.quantity.toLocaleString("fr-FR")} {r.unit}</Text>
            <Text style={{ opacity: 0.55 }}> · {r.abstraction ? "unité de jeu" : statusLabel[r.status] ?? r.status}</Text>
          </DocText>
        ))}
      </View>
      {d.confidential?.length ? (
        <>
          <DocRule />
          <DocLabel>Informations confidentielles</DocLabel>
          {d.confidential.map((c: string) => <DocText key={c}>{c}</DocText>)}
        </>
      ) : null}
    </View>
  );
}
