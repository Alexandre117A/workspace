import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CommandPost } from "../../components/game/CommandPost";
import { DossierContent } from "../../components/game/Dossier";
import { EnvelopeReveal } from "../../components/game/Envelope";
import { LastRoundBanner } from "../../components/game/chrome";
import { Lobby } from "../../components/game/Lobby";
import { PresidentPost } from "../../components/game/PresidentPost";
import { RomeOverlay } from "../../components/game/RomeOverlay";
import { Btn, Loading, Notice, Screen } from "../../components/ui";
import { useGame } from "../../lib/game";
import { useConfig, useRequireAuth } from "../../lib/hooks";
import { C } from "../../theme";

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useRequireAuth(`/session/${id}`);
  const { state, emit, ackRome, dismissLastRound } = useGame(user ? id : undefined);
  const { cfg } = useConfig();
  const [dossierOpen, setDossierOpen] = useState(false);
  const [dossierSeen, setDossierSeen] = useState(false);

  const status = state.runtime?.status ?? state.lobby?.session?.status;
  useEffect(() => {
    if (state.ended || status === "finished") {
      const t = setTimeout(() => router.replace(`/results/${id}`), 600);
      return () => clearTimeout(t);
    }
  }, [state.ended, status, id]);

  // Remise du dossier confidentiel : l'enveloppe apparaît dès l'attribution de l'acteur.
  useEffect(() => {
    if (state.dossier && state.runtime?.phase === "dossier" && !state.dossier.opened && !dossierSeen) setDossierOpen(true);
  }, [state.dossier, state.runtime?.phase, dossierSeen]);

  if (!user) return null;
  if (state.denied) return <Screen><Notice tone="error">{state.denied}</Notice><Btn label="Accueil" onPress={() => router.replace("/")} /></Screen>;
  if (!state.lobby) return <View style={{ flex: 1, backgroundColor: C.bg }}><Loading label="Connexion à la session" /></View>;

  const lobby = state.lobby;
  const mode = lobby.scenario?.mode ?? "contemporary";
  const era = lobby.scenario?.setting?.era ?? "contemporary";
  const title = lobby.session.name;
  const inGame = state.runtime && ["dossier", "running"].includes(state.runtime.status);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {!inGame ? (
        <Lobby sessionId={id} lobby={lobby} connected={state.connected} />
      ) : lobby.me.role === "president" ? (
        <PresidentPost game={state} emit={emit} title={title} />
      ) : (
        <CommandPost game={state} emit={emit} title={title} voice={!!cfg?.features.voice} openDossier={() => setDossierOpen(true)} />
      )}
      {state.dossier ? (
        <EnvelopeReveal visible={dossierOpen} label={`DOSSIER CONFIDENTIEL — ${state.dossier.actor.name.toUpperCase()}`} stamp={state.dossier.classification.split(" ")[0]}
          mode={mode} era={state.dossier.era ?? era} onOpened={() => setDossierSeen(true)}
          footer={<Btn label="Refermer le dossier" onPress={() => setDossierOpen(false)} accent="#7B1F1F" />}>
          <DossierContent d={state.dossier} />
        </EnvelopeReveal>
      ) : null}
      <RomeOverlay rome={state.rome} offset={state.offset} mode={mode} era={era} onAck={ackRome} />
      <LastRoundBanner data={state.lastRound} onDone={dismissLastRound} />
    </View>
  );
}
