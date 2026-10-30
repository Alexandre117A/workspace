import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { CARD_LABELS, CARD_ORDER, CardKey } from "@geonex/shared";
import { Body, Btn, Chip, Field, Label, Notice, Panel, Stepper, useLayout } from "../ui";
import { GeoMap } from "../GeoMap";
import { Ack } from "../../lib/game";
import { CARD_STYLE, C, F, S } from "../../theme";

/** Dossier de carte : pochette institutionnelle, onglet de couleur, code de classement. */
function CardFolder({ k, state, onPress, width }: { k: CardKey; state: any; onPress: () => void; width: number }) {
  const st = CARD_STYLE[k];
  const disabled = !state?.available;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={CARD_LABELS[k]} accessibilityState={{ disabled }} onPress={onPress}
      style={({ hovered }: any) => ({ width, opacity: state?.used ? 0.45 : 1, transform: [{ translateY: hovered && !disabled ? -3 : 0 }] })}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: "46%", height: 16, backgroundColor: st.color, borderTopLeftRadius: 2, borderTopRightRadius: 8 }} />
      </View>
      <View style={{ backgroundColor: "#16130F", borderWidth: 1, borderColor: st.color, borderTopColor: st.color, padding: S(4), minHeight: 170, gap: S(2) }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.monoBold, color: st.color, letterSpacing: 2, fontSize: 11 }}>DOSSIER {st.code}</Text>
          <Text style={{ color: st.color, fontSize: 18 }}>{st.glyph}</Text>
        </View>
        <Text style={{ fontFamily: F.title, fontSize: 24, color: C.text, lineHeight: 26 }}>{CARD_LABELS[k]}</Text>
        <Body muted style={{ fontSize: 12.5 }}>{st.subtitle}</Body>
        <View style={{ flex: 1 }} />
        <Svg width="100%" height={8}><Line x1="0" y1="4" x2="1000" y2="4" stroke={st.color} strokeWidth={0.6} strokeDasharray="4 3" opacity={0.6} /></Svg>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.6, color: state?.used ? C.muted : disabled ? C.faint : st.color }}>
          {state?.used ? "UTILISÉE" : disabled ? (state?.reason ?? "INDISPONIBLE").toUpperCase() : "USAGE UNIQUE · DISPONIBLE"}
        </Text>
      </View>
    </Pressable>
  );
}

function ActorPicker({ actors, selected, onToggle, max, color }: { actors: any[]; selected: string[]; onToggle: (id: string) => void; max: number; color: string }) {
  const { phone } = useLayout();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(2) }}>
      {actors.map((a) => {
        const on = selected.includes(a.id);
        return (
          <Pressable key={a.id} onPress={() => onToggle(a.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ width: phone ? "100%" : "48.5%", borderWidth: 1, borderColor: on ? color : C.line, backgroundColor: on ? `${color}22` : C.panel, padding: S(3), flexDirection: "row", justifyContent: "space-between", opacity: !on && selected.length >= max ? 0.5 : 1 }}>
            <Text style={{ fontFamily: F.sansMed, color: C.text, fontSize: 14 }}>{a.name}</Text>
            <Text style={{ fontFamily: F.mono, color: on ? color : C.faint, fontSize: 11 }}>{on ? "SÉLECTIONNÉ" : a.controlled_by === "human" ? "ÉQUIPE" : "SIMULÉ"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Invest({ me, value, onChange }: { me: any; value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>Ressources engagées</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>
        {(["political", "economic", "military"] as const).map((k) => (
          <Stepper key={k} label={{ political: "Politique", economic: "Économique", military: "Militaire" }[k]} value={value[k] ?? 0} min={0} max={Math.min(30, Math.floor(me.capitals[k]))} onChange={(v) => onChange({ ...value, [k]: v })} />
        ))}
      </View>
      <Body muted style={{ fontSize: 12.5 }}>Investir davantage améliore les moyens, sans jamais garantir le résultat.</Body>
    </View>
  );
}

const PLACEHOLDER = "Décrivez précisément votre objectif, votre cible et les moyens que vous souhaitez engager.";

function CardForm({ k, view, emit, onDone }: { k: CardKey; view: any; emit: (e: string, p?: unknown) => Promise<Ack>; onDone: () => void }) {
  const me = view.me;
  const color = CARD_STYLE[k].color;
  const others = view.actors.filter((a: any) => a.id !== me.id);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [invest, setInvest] = useState<Record<string, number>>({ political: 5 });
  const [channel, setChannel] = useState("diplomatic");
  const [audience, setAudience] = useState("international");
  const [effect, setEffect] = useState("credibility");
  const [domain, setDomain] = useState(view.setting.era === "space" ? "spatial" : "military");
  const [zone, setZone] = useState<any>(null);
  const [zoneName, setZoneName] = useState("");
  const [estimate, setEstimate] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(k === "targeted_intel" ? 1 : 2);
  const { width } = useLayout();

  useEffect(() => {
    if (k !== "political_shock" || !target) return;
    emit("card:estimate", { target }).then((r) => r.ok && setEstimate(r.data));
  }, [k, target]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload: any = { invest, intent: text };
    if (k === "targeted_intel") Object.assign(payload, { subjects, question: text });
    if (k === "interception") Object.assign(payload, { target, channel });
    if (k === "information_warfare") Object.assign(payload, { target, audience, effect });
    if (k === "political_shock") Object.assign(payload, { target });
    if (k === "new_front") Object.assign(payload, { target, domain, zone: zone?.zone_id ? zone : { ...zone, name: zoneName || zone?.name || "Nouveau front" } });
    const r = await emit("card:submit", { card: k, payload });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Demande refusée");
    onDone();
  };

  const domains = view.setting.era === "space" ? ["spatial", "economic", "diplomatic", "cyber"] : ["medieval", "napoleonic", "ancient", "early_modern"].includes(view.setting.era) ? ["military", "maritime", "economic", "diplomatic"] : ["military", "maritime", "economic", "diplomatic", "cyber"];
  const DLABEL: Record<string, string> = { military: "Militaire", maritime: "Maritime", economic: "Économique", diplomatic: "Diplomatique", cyber: "Cyber", spatial: "Spatial" };
  return (
    <View style={{ gap: S(4) }}>
      {k === "targeted_intel" && step === 1 ? (
        <>
          <Label color={color}>Sélectionnez deux acteurs ({subjects.length}/2)</Label>
          <ActorPicker actors={others} selected={subjects} max={2} color={color} onToggle={(id) => setSubjects((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s))} />
          <Btn label="Continuer" disabled={subjects.length !== 2} onPress={() => setStep(2)} accent={color} />
        </>
      ) : null}
      {step === 2 ? (
        <>
          {k === "targeted_intel" ? <Label color={color}>Sur {subjects.map((s) => others.find((o: any) => o.id === s)?.name).join(" et ")}</Label> : (
            <View style={{ gap: 6 }}>
              <Label color={color}>{k === "political_shock" ? "Pays ou organisation visé" : "Cible"}</Label>
              <ActorPicker actors={others} selected={target ? [target] : []} max={1} color={color} onToggle={(id) => setTarget(target === id ? null : id)} />
            </View>
          )}
          {k === "interception" ? (
            <View style={{ gap: 6 }}>
              <Label>Flux visé</Label>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {[["diplomatic", "Transmission diplomatique"], ["military", "Communication militaire"], ["communications", "Activité de communication"]].map(([v, l]) => <Chip key={v} label={l} active={channel === v} onPress={() => setChannel(v)} color={color} />)}
              </View>
            </View>
          ) : null}
          {k === "information_warfare" ? (
            <>
              <View style={{ gap: 6 }}>
                <Label>Public visé</Label>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {[["domestic", "Opinion intérieure de la cible"], ["international", "Opinion internationale"], ["coalition", "Partenaires de la cible"]].map(([v, l]) => <Chip key={v} label={l} active={audience === v} onPress={() => setAudience(v)} color={color} />)}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <Label>Effet recherché</Label>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {[["credibility", "Entamer la crédibilité"], ["opinion", "Retourner l'opinion simulée"], ["coalition_split", "Diviser une coalition"]].map(([v, l]) => <Chip key={v} label={l} active={effect === v} onPress={() => setEffect(v)} color={color} />)}
                </View>
              </View>
              <Label color={C.faint}>Mécanique interne à la simulation : aucun contenu n'est diffusé hors de GEONEX.</Label>
            </>
          ) : null}
          {k === "new_front" ? (
            <View style={{ gap: 6 }}>
              <Label>Zone du théâtre — touchez la carte ou choisissez une zone existante</Label>
              <View style={{ borderWidth: 1, borderColor: C.line, alignSelf: "flex-start" }}>
                <GeoMap width={Math.min(width - 80, 640)} height={300} focus={view.setting.theatre.iso_n3} center={view.setting.theatre.center}
                  fictional={view.setting.theatre.map_kind === "fictional" ? view.setting.theatre.fictional_regions : null}
                  points={[...view.zones.map((z: any) => ({ ...z.region, label: z.name, kind: "zone" as const })), ...(zone && !zone.zone_id ? [{ ...zone, label: zoneName || "Nouveau front", kind: "pick" as const, color }] : [])]}
                  onPick={(pt) => setZone(pt)} />
              </View>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {view.zones.map((z: any) => <Chip key={z.id} label={z.name} active={zone?.zone_id === z.id} onPress={() => setZone({ zone_id: z.id, name: z.name })} color={color} />)}
              </View>
              {zone && !zone.zone_id ? <Field value={zoneName} onChangeText={setZoneName} placeholder="Nom de la zone (ex. Façade nord, Ceinture d'astéroïdes)" /> : null}
              <Label>Nature du front</Label>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>{domains.map((d) => <Chip key={d} label={DLABEL[d]} active={domain === d} onPress={() => setDomain(d)} color={color} />)}</View>
            </View>
          ) : null}
          {k === "political_shock" && target ? (
            <Panel title="Probabilité estimée" accent={color}>
              <Text style={{ fontFamily: F.title, fontSize: 44, color: C.text }}>{estimate ? Math.round(estimate.estimate * 100) : 30} %</Text>
              <Body muted style={{ fontSize: 12.5 }}>
                {estimate?.reports_considered ? `Estimation ajustée selon ${estimate.reports_considered} renseignement(s) détenu(s) (pertinence, crédibilité, précision, qualité).` : "Estimation initiale sans renseignement préalable pertinent."} Ce n'est pas une garantie.
              </Body>
            </Panel>
          ) : null}
          <Field value={text} onChangeText={setText} multiline style={{ minHeight: 90 }}
            placeholder={k === "targeted_intel" ? "Que souhaitez-vous savoir ? (discussions entre ces acteurs, existence d'un accord, intentions probables…)" : k === "political_shock" ? "Décrivez le choc politique recherché (crise de gouvernement, rupture de coalition, contestation…)" : PLACEHOLDER} />
          <Invest me={me} value={invest} onChange={setInvest} />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
            {k === "targeted_intel" ? <Btn variant="ghost" label="Retour" onPress={() => setStep(1)} /> : null}
            <Btn label="Soumettre la requête officielle" accent={color} busy={busy} disabled={!text.trim() || (k !== "targeted_intel" && !target) || (k === "new_front" && !zone)} onPress={submit} />
          </View>
          {["political_shock", "new_front"].includes(k) ? <Body muted style={{ fontSize: 12.5 }}>Cette requête sera transmise au Président de séance pour arbitrage.</Body> : null}
        </>
      ) : null}
    </View>
  );
}

export function CardsPanel({ view, runtime, emit }: { view: any; runtime: any; emit: (e: string, p?: unknown) => Promise<Ack> }) {
  const { width, desktop } = useLayout();
  const [open, setOpen] = useState<CardKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cards = view.cards ?? {};
  const phaseOk = ["diplomacy", "decisions"].includes(runtime?.phase);
  if (open) {
    return (
      <View style={{ gap: S(4) }}>
        <Pressable onPress={() => setOpen(null)}><Label>← Les cinq dossiers</Label></Pressable>
        <View style={{ borderLeftWidth: 3, borderLeftColor: CARD_STYLE[open].color, paddingLeft: S(3) }}>
          <Label color={CARD_STYLE[open].color}>Dossier {CARD_STYLE[open].code}</Label>
          <Text style={{ fontFamily: F.title, fontSize: 30, color: C.text }}>{CARD_LABELS[open]}</Text>
        </View>
        {!phaseOk ? <Notice tone="warn">Les cartes se jouent pendant la Diplomatie ou les Décisions.</Notice> : null}
        <CardForm k={open} view={view} emit={emit} onDone={() => { setNotice(`« ${CARD_LABELS[open]} » transmise. Résultat à la fin du round.`); setOpen(null); }} />
      </View>
    );
  }
  const inner = Math.min(width, 1100) - S(16);
  const fw = desktop ? Math.min(220, (inner - S(16)) / 5) : width < 700 ? inner : (inner - S(4)) / 2;
  const order = desktop ? ["targeted_intel", "interception", "political_shock", "information_warfare", "new_front"] : CARD_ORDER;
  return (
    <View style={{ gap: S(5) }}>
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4), justifyContent: "center", alignItems: desktop ? "center" : "flex-start" }}>
        {(order as CardKey[]).map((k, i) => (
          <View key={k} style={desktop ? { marginTop: i === 2 ? 0 : 28, transform: [{ rotate: `${[-3, -1.5, 0, 1.5, 3][i]}deg` }] } : undefined}>
            <CardFolder k={k} state={cards[k]} width={fw} onPress={() => cards[k]?.available && setOpen(k)} />
          </View>
        ))}
      </View>
      {view.cards_used?.length ? (
        <Panel title="Cartes engagées">
          {view.cards_used.map((c: any) => (
            <View key={c.id} style={{ gap: 2 }}>
              <Body style={{ fontSize: 13.5 }}><Text style={{ color: CARD_STYLE[c.card as CardKey].color, fontFamily: F.sansBold }}>{CARD_LABELS[c.card as CardKey]}</Text> · round {c.round} · {({ submitted: "en attente de résolution", resolved: "résolue", rejected: "refusée par le Président" } as any)[c.status]}</Body>
              {c.result?.summary ? <Body muted style={{ fontSize: 12.5 }}>{c.result.summary}</Body> : null}
            </View>
          ))}
        </Panel>
      ) : null}
      {view.intel?.length ? (
        <Panel title="Rapports de renseignement" accent={CARD_STYLE.targeted_intel.color}>
          {view.intel.map((r: any) => (
            <View key={r.id} style={{ gap: 4, borderLeftWidth: 2, borderLeftColor: C.line, paddingLeft: S(3) }}>
              <Label color={C.muted}>Round {r.round} · {r.kind === "interception" ? "Interception" : "Renseignement ciblé"} · fiabilité estimée {r.reliability_pct} % · {r.confidence_label}</Label>
              <Body style={{ fontSize: 13.5 }}>{r.finding}</Body>
            </View>
          ))}
          <Body muted style={{ fontSize: 12 }}>Le pourcentage et l'appréciation qualitative sont évalués séparément par vos services. Une source crédible peut être compromise.</Body>
        </Panel>
      ) : null}
    </View>
  );
}
