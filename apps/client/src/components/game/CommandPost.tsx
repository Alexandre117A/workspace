import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PHASE_LABELS } from "@geonex/shared";
import { Backdrop, Label, Notice, Sheet, useLayout } from "../ui";
import { GeoMap } from "../GeoMap";
import { Ack } from "../../lib/game";
import { CARD_STYLE, C, F, S } from "../../theme";
import { CardsPanel } from "./CardsPanel";
import { AccessCard, RoundMark, TopBar } from "./chrome";
import { BalancePanel, CapitalPanel, DomesticPanel } from "./panels";
import { AssemblyPhase, BriefingPhase, ConsequencesPhase, DecisionsPhase, DiplomacyPhase, DossierPhase, PhaseProps, ReportBody, WaitPhase } from "./phases";

type SheetKey = "capital" | "cards" | "balance" | "domestic" | "report" | null;

/** Poste de commandement d'une équipe. */
export function CommandPost({ game, emit, title, voice, openDossier }: { game: any; emit: (e: string, p?: unknown) => Promise<Ack>; title: string; voice: boolean; openDossier: () => void }) {
  const { width, height, phone, desktop } = useLayout();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const { view, runtime, offset } = game;
  if (!view?.me || !runtime) return null;
  const me = view.me;
  const p: PhaseProps = { view, runtime, offset, messages: game.messages, invites: game.invites, report: game.report, emit, voice, openDossier, openCards: () => setSheet("cards") };
  const fictional = view.setting.theatre.map_kind === "fictional";
  const zones = view.zones.map((z: any) => ({ ...z.region, label: z.name, kind: "zone" as const }));
  const events = (view.events ?? []).filter((e: any) => e.location && e.round >= runtime.round - 1).map((e: any) => ({ ...e.location, kind: "event" as const, color: C.amber }));

  const phasePanel = (() => {
    switch (runtime.phase) {
      case "dossier": return <DossierPhase p={p} />;
      case "briefing": return <BriefingPhase p={p} />;
      case "assembly": return <AssemblyPhase p={p} />;
      case "diplomacy": return <DiplomacyPhase p={p} />;
      case "decisions": return <DecisionsPhase p={p} />;
      case "arbitration": return <WaitPhase text="Le Président de séance arbitre les demandes. Aucune décision n'est perdue : une demande non arbitrée est transmise au moteur sans probabilité présidentielle." />;
      case "resolution": return <WaitPhase text="Le moteur confronte toutes les décisions, engagements, opérations et événements dans un environnement commun…" />;
      case "consequences": return <ConsequencesPhase p={p} />;
      default: return <WaitPhase text="Résolution finale et préparation des résultats…" />;
    }
  })();

  const cardsLeft = Object.values(view.cards ?? {}).filter((c: any) => c.available).length;
  const access = (compact: boolean) => ({
    capital: <AccessCard compact={compact} label="Capital" color={C.steel} value={`${Math.round(me.capitals.political)} · ${Math.round(me.capitals.economic)} · ${Math.round(me.capitals.military)}`} sub="Pol. · Éco. · Mil." onPress={() => setSheet("capital")} />,
    cards: <AccessCard compact={compact} label="Cartes spéciales" color={CARD_STYLE.political_shock.color} value={runtime.round < 2 ? "Round 2" : `${cardsLeft}/5`} sub={runtime.round < 2 ? "Disponibles au round 2" : "dossiers disponibles"} onPress={() => setSheet("cards")} />,
    domestic: <AccessCard compact={compact} label="Situation intérieure" color={C.amber} value={`${Math.round(me.stability)}`} sub="stabilité /100" onPress={() => setSheet("domestic")} />,
    balance: <AccessCard compact={compact} label="Rapport de force" color={C.brass} locked={!view.balance} value={view.balance ? `${Object.values(view.balance.shares as Record<string, number>).join(" / ")} %` : "—"} sub={view.balance ? "camps" : `Débloqué au round 3`} onPress={() => setSheet("balance")} />,
  });

  const panelWidth = desktop ? 560 : phone ? width : Math.min(640, width - 32);
  const sheets = (
    <>
      <Sheet visible={sheet === "capital"} onClose={() => setSheet(null)} title="Capitaux et ressources" accent={C.steel}><CapitalPanel view={view} report={game.report} /></Sheet>
      <Sheet visible={sheet === "cards"} onClose={() => setSheet(null)} title="Cartes stratégiques" accent={CARD_STYLE.political_shock.color} wide><CardsPanel view={view} runtime={runtime} emit={emit} /></Sheet>
      <Sheet visible={sheet === "balance"} onClose={() => setSheet(null)} title="Rapport de force" accent={C.brass}><BalancePanel view={view} round={runtime.round} /></Sheet>
      <Sheet visible={sheet === "domestic"} onClose={() => setSheet(null)} title={`Situation intérieure — ${me.name}`} accent={C.amber}><DomesticPanel view={view} /></Sheet>
      <Sheet visible={sheet === "report"} onClose={() => setSheet(null)} title={`Rapport du round ${game.report?.round ?? ""}`}><ReportBody report={game.report} view={view} /></Sheet>
    </>
  );
  const top = (
    <TopBar title={title} runtime={runtime} offset={offset} simTime={view.sim_time} connected={game.connected}
      right={<Text onPress={openDossier} style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.6, color: C.brass }}>DOSSIER</Text>} />
  );
  const phaseHeader = (
    <View style={{ gap: 2, marginBottom: S(3) }}>
      <Label color={C.muted}>{me.name} · {me.camp_label}</Label>
      <Text style={{ fontFamily: F.title, fontSize: 28, color: C.text }}>{PHASE_LABELS[runtime.phase as keyof typeof PHASE_LABELS]}</Text>
      {game.report && runtime.phase !== "consequences" ? <Text onPress={() => setSheet("report")} style={{ fontFamily: F.mono, fontSize: 11, color: C.brass }}>Rapport du round {game.report.round} ›</Text> : null}
    </View>
  );

  if (phone) {
    const a = access(true);
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Backdrop />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          {top}
          <ScrollView contentContainerStyle={{ paddingBottom: 150 }}>
            <View style={{ height: 190, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <GeoMap width={width} height={190} focus={view.setting.theatre.iso_n3} highlight={fictional ? [me.id] : me.iso_n3} center={view.setting.theatre.center}
                fictional={fictional ? view.setting.theatre.fictional_regions : null} points={[...zones, ...events]} warning={view.setting.theatre.border_warning} showLabels={false} />
            </View>
            {!game.connected ? <View style={{ padding: S(3) }}><Notice tone="warn">Connexion interrompue — reconnexion automatique…</Notice></View> : null}
            <View style={{ padding: S(4) }}>{phaseHeader}{phasePanel}</View>
          </ScrollView>
        </SafeAreaView>
        <SafeAreaView edges={["bottom"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#05070AF2", borderTopWidth: 1, borderTopColor: C.line }}>
          <View style={{ flexDirection: "row", gap: 6, padding: 6 }}>{a.capital}{a.cards}{a.domestic}{a.balance}</View>
          <View style={{ alignItems: "flex-end", paddingHorizontal: S(3), paddingBottom: 4 }}><RoundMark round={runtime.round} /></View>
        </SafeAreaView>
        {sheets}
      </View>
    );
  }

  const a = access(false);
  const homeW = desktop ? width * 0.55 : width;
  const homeH = desktop ? height - 60 : height * 0.36;
  const theatreW = desktop ? Math.min(460, width * 0.3) : width / 2 - 24;
  const theatreH = desktop ? 300 : height * 0.3;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop dense />
      <SafeAreaView style={{ flex: 1 }}>
        {top}
        <View style={{ flex: 1 }}>
          {/* Territoire de l'acteur : fond sombre, presque monochrome. */}
          <View style={{ position: "absolute", left: 0, top: 0, opacity: 0.9 }} pointerEvents="none">
            <GeoMap width={homeW} height={homeH} variant="home" highlight={fictional ? [me.id] : me.iso_n3}
              fictional={fictional ? view.setting.theatre.fictional_regions : null}
              points={me.regions.map((r: any) => ({ ...r, kind: "city" as const }))} showLabels={false} />
            <Text style={{ position: "absolute", left: S(5), top: S(4), fontFamily: F.title, fontSize: desktop ? 54 : 36, color: "#ffffff18" }}>{me.name}</Text>
          </View>
          {/* Théâtre de la crise : style distinct (laiton), zones et événements. */}
          <View style={{ position: "absolute", right: S(4), top: S(4), width: theatreW, borderWidth: 1, borderColor: C.lineHi, backgroundColor: "#070A0EE6" }}>
            <View style={{ paddingHorizontal: S(3), paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}><Label color={C.brass}>Théâtre · {view.setting.theatre.name}</Label></View>
            <GeoMap width={theatreW - 2} height={theatreH} focus={view.setting.theatre.iso_n3} highlight={fictional ? [me.id] : me.iso_n3} center={view.setting.theatre.center}
              fictional={fictional ? view.setting.theatre.fictional_regions : null} points={[...zones, ...events]} warning={view.setting.theatre.border_warning} />
          </View>
          {/* Panneau de phase central. */}
          <View style={{ position: "absolute", left: desktop ? Math.max(S(6), width * 0.3 - panelWidth / 2) : 16, top: desktop ? S(6) : theatreH + S(10), bottom: 120, width: panelWidth }}>
            <ScrollView style={{ backgroundColor: "#0A0F14F2", borderWidth: 1, borderColor: C.lineHi }} contentContainerStyle={{ padding: S(5) }}>
              {!game.connected ? <Notice tone="warn">Connexion interrompue — reconnexion automatique…</Notice> : null}
              {phaseHeader}
              {phasePanel}
            </ScrollView>
          </View>
          <View style={{ position: "absolute", left: S(4), bottom: S(4), flexDirection: "row", gap: S(3) }}>{a.capital}{a.cards}</View>
          <View style={{ position: "absolute", right: S(4), bottom: S(4), alignItems: "flex-end", gap: S(2) }}>
            <View style={{ flexDirection: "row", gap: S(3) }}>{a.domestic}{a.balance}</View>
            <RoundMark round={runtime.round} />
          </View>
        </View>
      </SafeAreaView>
      {sheets}
    </View>
  );
}
