import { Text, View } from "react-native";
import { Bar, Body, Label, Panel, statusLabel } from "../ui";
import { GeoMap } from "../GeoMap";
import { useLayout } from "../ui";
import { C, F, S } from "../../theme";

const DOMAIN: Record<string, string> = { military: "terrestre / militaire", maritime: "maritime", economic: "économique", diplomatic: "diplomatique", spatial: "spatial", cyber: "cyber" };
const KIND: Record<string, string> = { state: "État", organization: "Organisation", company: "Entreprise", armed_group: "Groupe armé", coalition: "Coalition", polity: "Entité politique", other: "Acteur" };
const ERA: Record<string, string> = { ancient: "Antiquité", medieval: "Moyen Âge", early_modern: "Époque moderne", napoleonic: "Époque napoléonienne", industrial: "Ère industrielle", cold_war: "Guerre froide", contemporary: "Monde contemporain", space: "Ère spatiale", fantasy: "Univers imaginaire" };

/** Dossier de situation : tout ce qui est public sur le sujet de la simulation (aucun secret d'équipe). */
export function Situation({ view, scenario }: { view: any; scenario?: any }) {
  const { width } = useLayout();
  const s = view.setting;
  const mapW = Math.min(width - 72, 700);
  const camps: Record<string, string> = s.camps ?? {};
  const byCamp = Object.keys(camps).map((k) => ({ key: k, label: camps[k], actors: view.actors.filter((a: any) => a.camp === k) })).filter((c) => c.actors.length);
  const fictional = s.theatre.map_kind === "fictional";
  const notes: string[] = (s.notes ?? "").split("\n").filter(Boolean);
  const events = (view.events ?? []).slice(-8).reverse();
  return (
    <View style={{ gap: S(4) }}>
      <View style={{ gap: 4 }}>
        <Label color={C.brass}>{ERA[s.era] ?? s.era} · {s.start_label}</Label>
        <Text style={{ fontFamily: F.title, fontSize: 30, color: C.text }}>{s.title}</Text>
        {scenario?.summary ? <Body muted style={{ fontSize: 14 }}>{scenario.summary}</Body> : null}
      </View>
      <View style={{ borderWidth: 1, borderColor: C.line, alignSelf: "center" }}>
        <GeoMap width={mapW} height={Math.round(mapW * 0.55)} focus={s.theatre.iso_n3} center={s.theatre.center} fictional={fictional ? s.theatre.fictional_regions : null}
          points={view.zones.map((z: any) => ({ ...z.region, label: z.name, kind: "zone" as const }))} warning={s.theatre.border_warning} />
      </View>
      {notes.length ? (
        <Panel title={`Repères · ${s.theatre.name}`} accent={C.brass}>
          {notes.map((n) => <Body key={n} style={{ fontSize: 14 }}>— {n}</Body>)}
          <Label color={C.faint}>Repères généraux issus de sources publiques ; à vérifier avant tout usage hors simulation.</Label>
        </Panel>
      ) : null}
      <Panel title="Camps en présence" accent={C.steel}>
        {byCamp.map((c) => (
          <View key={c.key} style={{ gap: 6 }}>
            <Label color={C.steel}>{c.label}</Label>
            {c.actors.map((a: any) => (
              <View key={a.id} style={{ gap: 2, borderLeftWidth: 2, borderLeftColor: a.controlled_by === "human" ? C.brass : C.line, paddingLeft: S(3) }}>
                <Text style={{ fontFamily: F.sansBold, color: C.text, fontSize: 14.5 }}>{a.name} <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>{KIND[a.kind] ?? a.kind} · {a.controlled_by === "human" ? "ÉQUIPE" : "SIMULÉ"}</Text></Text>
                {a.leader ? <Body muted style={{ fontSize: 12.5 }}>Direction : {a.leader} ({statusLabel[a.leader_status] ?? a.leader_status})</Body> : null}
                {a.description ? <Body muted style={{ fontSize: 12.5 }}>{a.description}</Body> : null}
              </View>
            ))}
          </View>
        ))}
      </Panel>
      <Panel title="Zones sensibles" accent={C.red}>
        {view.zones.map((z: any) => (
          <View key={z.id} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.sansMed, color: C.text, fontSize: 14 }}>{z.name}</Text>
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: z.tension > 65 ? C.red : C.amber }}>TENSION {z.tension}</Text>
            </View>
            <Label color={C.faint}>Domaine {DOMAIN[z.domain] ?? z.domain}</Label>
          </View>
        ))}
        {view.wars?.length ? <Body style={{ fontSize: 13.5, color: C.red }}>États de guerre : {view.wars.map((w: string[]) => `${view.actors.find((a: any) => a.id === w[0])?.name} ↔ ${view.actors.find((a: any) => a.id === w[1])?.name}`).join(" ; ")}</Body> : null}
      </Panel>
      {view.escalation?.length ? (
        <Panel title="Échelle d'escalade" accent={C.red}>
          {view.escalation.map((e: any) => {
            const n = (id: string) => view.actors.find((a: any) => a.id === id)?.name ?? id;
            return (
              <View key={e.a + e.b} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontFamily: F.sansMed, color: C.text, fontSize: 14 }}>{n(e.a)} ↔ {n(e.b)}</Text><Text style={{ fontFamily: F.monoBold, fontSize: 11, color: e.rung >= 6 ? C.red : C.amber }}>PALIER {e.rung}/9</Text></View>
                <Bar value={e.rung} max={9} color={e.rung >= 6 ? C.red : C.amber} height={4} />
                <Label color={C.faint}>{e.label}</Label>
              </View>
            );
          })}
          <Label color={C.faint}>Du palier 6, chaque camp paie un coût réel ; du palier 8, le monde entier est touché.</Label>
        </Panel>
      ) : null}
      {events.length ? (
        <Panel title="Fil des événements publics">
          {events.map((e: any) => <Body key={e.id} style={{ fontSize: 13 }}><Text style={{ color: C.muted, fontFamily: F.mono }}>R{e.round} </Text>{e.title}</Body>)}
        </Panel>
      ) : null}
    </View>
  );
}
