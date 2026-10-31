import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PHASE_LABELS } from "@geonex/shared";
import { Label, Notice, useLayout } from "../ui";
import { Backdrop, Sheet } from "./hud";
import { ContextStrip, TeamWorkspace, useAtlas } from "../../atlas/AtlasWorkspace";
import { Ack } from "../../lib/game";
import { CARD_STYLE, C, F, S } from "../../theme";
import { CardsPanel } from "./CardsPanel";
import { AccessCard, RoundMark, TopBar } from "./chrome";
import { BalancePanel, CapitalPanel, DomesticPanel } from "./panels";
import { Situation } from "./Situation";
import { Flag } from "../Flag";
import { AssemblyPhase, BriefingPhase, ConsequencesPhase, DecisionsPhase, DiplomacyPhase, DossierPhase, PhaseProps, ReportBody, WaitPhase } from "./phases";

type SheetKey = "capital" | "cards" | "balance" | "domestic" | "report" | "situation" | null;

/** Poste de commandement d'une équipe. */
export function CommandPost({ game, emit, title, voice, openDossier }: { game: any; emit: (e: string, p?: unknown) => Promise<Ack>; title: string; voice: boolean; openDossier: () => void }) {
  const { phone } = useLayout();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const { view, runtime, offset } = game;
  const { ctx, previous } = useAtlas(view);
  if (!view?.me || !runtime || !ctx) return null;
  const me = view.me;
  const p: PhaseProps = { view, runtime, offset, messages: game.messages, invites: game.invites, report: game.report, emit, voice, sessionId: game.lobby?.session?.id ?? "", openDossier, openCards: () => setSheet("cards") };

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

  const sheets = (
    <>
      <Sheet visible={sheet === "capital"} onClose={() => setSheet(null)} title="Capitaux et ressources" accent={C.steel}><CapitalPanel view={view} report={game.report} /></Sheet>
      <Sheet visible={sheet === "cards"} onClose={() => setSheet(null)} title="Cartes stratégiques" accent={CARD_STYLE.political_shock.color} wide><CardsPanel view={view} runtime={runtime} emit={emit} /></Sheet>
      <Sheet visible={sheet === "balance"} onClose={() => setSheet(null)} title="Rapport de force" accent={C.brass}><BalancePanel view={view} round={runtime.round} /></Sheet>
      <Sheet visible={sheet === "domestic"} onClose={() => setSheet(null)} title={`Situation intérieure — ${me.name}`} accent={C.amber}><DomesticPanel view={view} /></Sheet>
      <Sheet visible={sheet === "situation"} onClose={() => setSheet(null)} title="Dossier de situation" accent={C.steel} wide><Situation view={view} scenario={game.lobby?.scenario} /></Sheet>
      <Sheet visible={sheet === "report"} onClose={() => setSheet(null)} title={`Rapport du round ${game.report?.round ?? ""}`}><ReportBody report={game.report} view={view} /></Sheet>
    </>
  );
  const top = (
    <TopBar title={title} runtime={runtime} offset={offset} simTime={view.sim_time} connected={game.connected} strip={<ContextStrip ctx={ctx} runtime={runtime} />}
      right={<View style={{ flexDirection: "row", gap: 12 }}><Text onPress={() => setSheet("situation")} style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.6, color: C.steel }}>SITUATION</Text><Text onPress={openDossier} style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.6, color: C.brass }}>DOSSIER</Text></View>} />
  );
  const phaseHeader = (
    <View style={{ gap: 2, marginBottom: S(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Flag actor={me} h={16} /><Label color={C.muted}>{me.name} · {me.camp_label}</Label></View>
      <Text style={{ fontFamily: F.title, fontSize: 28, color: C.text }}>{PHASE_LABELS[runtime.phase as keyof typeof PHASE_LABELS]}</Text>
      {view.setting.notes ? <Text onPress={() => setSheet("situation")} style={{ fontFamily: F.titleItalic, fontSize: 15, color: C.muted, lineHeight: 20 }} numberOfLines={2}>{view.setting.theatre.name} — {view.setting.notes.split(String.fromCharCode(10))[runtime.round % view.setting.notes.split(String.fromCharCode(10)).length]}</Text> : null}
      {game.report && runtime.phase !== "consequences" ? <Text onPress={() => setSheet("report")} style={{ fontFamily: F.mono, fontSize: 11, color: C.brass }}>Rapport du round {game.report.round} ›</Text> : null}
    </View>
  );

  const reconnect = !game.connected ? <View style={{ paddingBottom: S(3) }}><Notice tone="warn">Connexion interrompue — reconnexion automatique…</Notice></View> : null;
  const decision = <>{phaseHeader}{phasePanel}</>;

  if (phone) {
    const a = access(true);
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Backdrop />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          {top}
          <TeamWorkspace view={view} ctx={ctx} previous={previous} decision={decision} access={null} notice={reconnect} bottomInset={150} />
        </SafeAreaView>
        <SafeAreaView edges={["bottom"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#0B1420F2", borderTopWidth: 1, borderTopColor: C.line }}>
          <View style={{ flexDirection: "row", gap: 6, padding: 6 }}>{a.capital}{a.cards}{a.domestic}{a.balance}</View>
          <View style={{ alignItems: "flex-end", paddingHorizontal: S(3), paddingBottom: 4 }}><RoundMark round={runtime.round} /></View>
        </SafeAreaView>
        {sheets}
      </View>
    );
  }

  const a = access(false);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop dense />
      <SafeAreaView style={{ flex: 1 }}>
        {top}
        <TeamWorkspace view={view} ctx={ctx} previous={previous} decision={decision} notice={reconnect} runtime={runtime}
          access={<>{a.capital}{a.cards}{a.domestic}{a.balance}<View style={{ justifyContent: "flex-end", paddingBottom: 4 }}><RoundMark round={runtime.round} /></View></>} />
      </SafeAreaView>
      {sheets}
    </View>
  );
}
