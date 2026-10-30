import { Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { BALANCE_UNLOCK_ROUND } from "@geonex/shared";
import { Bar, Body, Label, Panel, statusLabel, useLayout } from "../ui";
import { GeoMap } from "../GeoMap";
import { Curve } from "../Curve";
import { C, F, S } from "../../theme";

const CAPS = [
  { k: "political", label: "Capital politique", color: C.steel, desc: "Influence, légitimité, soutien et marge de manœuvre." },
  { k: "economic", label: "Capital économique", color: C.brass, desc: "Capacités économiques mobilisables." },
  { k: "military", label: "Capital militaire", color: C.red, desc: "Puissance militaire disponible." },
] as const;

export function CapitalPanel({ view, report }: { view: any; report: any }) {
  const me = view.me;
  const changes = report?.private?.capital_changes;
  return (
    <View style={{ gap: S(4) }}>
      {CAPS.map((c) => {
        const ch = changes?.[c.k];
        return (
          <Panel key={c.k} title={c.label} accent={c.color}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: S(3) }}>
              <Text style={{ fontFamily: F.title, fontSize: 48, color: C.text }}>{Math.round(me.capitals[c.k])}</Text>
              <Text style={{ fontFamily: F.mono, color: C.muted, marginBottom: 10 }}>/100</Text>
              {ch ? <Text style={{ fontFamily: F.monoBold, color: ch.delta >= 0 ? C.green : C.red, marginBottom: 10 }}>{ch.delta >= 0 ? "▲ +" : "▼ "}{ch.delta} depuis le round précédent</Text> : null}
            </View>
            <Bar value={me.capitals[c.k]} color={c.color} />
            <Curve width={300} height={64} series={[{ values: [me.initial_capitals[c.k], ...(me.history ?? []).map((h: any) => h.capitals[c.k])], color: c.color }]} />
            <Body muted style={{ fontSize: 12.5 }}>{c.desc} Départ : {Math.round(me.initial_capitals[c.k])}.</Body>
            {ch?.reasons?.slice(0, 5).map((r: any, i: number) => <Body key={i} style={{ fontSize: 13 }}>{r.delta >= 0 ? "+" : ""}{r.delta} · {r.reason}</Body>)}
          </Panel>
        );
      })}
      <Panel title="Indicateurs intérieurs">
        {[["Stabilité intérieure", me.stability], ["Cohésion nationale", me.cohesion], ["Approbation du gouvernement", me.approval], ["Disponibilité opérationnelle des forces", me.readiness ?? 85], ["Lassitude de guerre", me.weariness ?? 0]].map(([l, v]) => (
          <View key={l as string} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Body style={{ fontSize: 13.5 }}>{l}</Body><Text style={{ fontFamily: F.monoBold, color: C.text }}>{Math.round(v as number)}/100</Text></View>
            <Bar value={v as number} color={C.steel} height={4} />
          </View>
        ))}
        <Label color={C.faint}>{me.indicators_source?.label ?? statusLabel[me.indicators_source?.status]}</Label>
      </Panel>
      <Panel title="Ressources concrètes">
        {me.resources.map((r: any) => (
          <View key={r.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: S(2) }}>
            <Body style={{ fontSize: 13.5, flex: 1 }}>{r.label}<Text style={{ color: C.faint }}> · {r.abstraction ? "unité de jeu" : statusLabel[r.status]}</Text></Body>
            <Text style={{ fontFamily: F.monoBold, color: r.available < r.quantity ? C.amber : C.text }}>{r.usable ? `${r.available}/${r.quantity}` : r.quantity.toLocaleString("fr-FR")} {r.unit}</Text>
          </View>
        ))}
        {me.locks?.length ? <Body muted style={{ fontSize: 12.5 }}>Immobilisé : {me.locks.map((l: any) => `${l.quantity} × ${me.resources.find((r: any) => r.key === l.key)?.label ?? l.key} (${l.reason}, jusqu'au round ${l.release_round})`).join(" ; ")}</Body> : null}
      </Panel>
    </View>
  );
}

export function BalancePanel({ view, round }: { view: any; round: number }) {
  if (!view.balance) {
    return (
      <View style={{ alignItems: "center", gap: S(4), paddingVertical: S(10) }}>
        <Svg width={46} height={56} viewBox="0 0 46 56">
          <Rect x="4" y="24" width="38" height="28" stroke={C.muted} strokeWidth="1.6" fill="none" />
          <Path d="M12 24 L12 16 A11 11 0 0 1 34 16 L34 24" stroke={C.muted} strokeWidth="1.6" fill="none" />
        </Svg>
        <Text style={{ fontFamily: F.title, fontSize: 26, color: C.text }}>Rapport de force verrouillé</Text>
        <Body muted style={{ textAlign: "center" }}>Il devient publiquement accessible à partir du round {BALANCE_UNLOCK_ROUND} (round actuel : {round}).</Body>
      </View>
    );
  }
  const b = view.balance;
  const camps = Object.entries(b.shares) as [string, number][];
  const colors = [C.steel, C.red, C.brass, C.green];
  return (
    <View style={{ gap: S(4) }}>
      <Panel title="Rapport de force entre les camps">
        <View style={{ flexDirection: "row", height: 16 }}>
          {camps.map(([k, v], i) => <View key={k} style={{ width: `${v}%`, backgroundColor: colors[i % 4] }} />)}
        </View>
        {camps.map(([k, v], i) => <Body key={k} style={{ fontSize: 14 }}><Text style={{ color: colors[i % 4] }}>■ </Text>{b.labels?.[k] ?? k} : {v} %</Body>)}
      </Panel>
      <Panel title="Indice de puissance relative">
        {b.ranking.map((r: any) => (
          <View key={r.id} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Body style={{ fontSize: 13.5 }}>{r.name}</Body><Text style={{ fontFamily: F.monoBold, color: C.text }}>{r.index}</Text></View>
            <Bar value={r.index} color={C.lineHi} height={3} />
          </View>
        ))}
      </Panel>
    </View>
  );
}

export function DomesticPanel({ view }: { view: any }) {
  const { width } = useLayout();
  const me = view.me;
  const events = (view.private_events ?? []).slice().reverse();
  const fictional = view.setting.theatre.map_kind === "fictional";
  const mapW = Math.min(width - 72, 680);
  return (
    <View style={{ gap: S(4) }}>
      <View style={{ borderWidth: 1, borderColor: C.line, alignSelf: "center" }}>
        <GeoMap width={mapW} height={Math.round(mapW * 0.62)} variant="home" highlight={fictional ? [me.id] : me.iso_n3}
          fictional={fictional ? view.setting.theatre.fictional_regions : null}
          points={[...me.regions.map((r: any) => ({ ...r, kind: "city" as const })), ...events.filter((e: any) => e.location).map((e: any) => ({ ...e.location, label: e.title, kind: "event" as const, color: C.amber }))]} />
      </View>
      {events.length === 0 ? <Body muted>Aucun événement intérieur signalé pour l'instant.</Body> : null}
      {events.map((e: any) => (
        <Panel key={e.id} title={`Round ${e.round}${e.location?.name ? ` · ${e.location.name}` : ""}`} accent={C.amber}>
          <Text style={{ fontFamily: F.sansBold, color: C.text, fontSize: 15 }}>{e.title}</Text>
          <Body style={{ fontSize: 14 }}>{e.text}</Body>
          {e.figures && Object.keys(e.figures).length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>
              {Object.entries(e.figures).filter(([k]) => k !== "lieu").map(([k, v]) => <Label key={k} color={C.muted}>{k.replace(/_/g, " ")} : {typeof v === "number" ? v.toLocaleString("fr-FR") : String(v)}</Label>)}
            </View>
          ) : null}
        </Panel>
      ))}
    </View>
  );
}
