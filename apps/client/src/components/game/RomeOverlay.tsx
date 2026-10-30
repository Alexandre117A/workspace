import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Btn } from "../ui";
import { fmtClock, remaining, useNow } from "../../lib/game";
import { DocLabel, DocRule, DocText, DocTitle, EnvelopeReveal } from "./Envelope";
import { F, S } from "../../theme";

const ALERT = require("../../../assets/sounds/rome-alert.wav");

function playAlert() {
  try {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    const player = createAudioPlayer(ALERT);
    player.play();
    const sub = player.addListener("playbackStatusUpdate", (st: any) => {
      if (st.didJustFinish) {
        sub.remove();
        player.remove();
      }
    });
  } catch {
    /* audio indisponible : l'alerte visuelle suffit */
  }
}

/** Communiqué de Rome : enveloppe URGENT plein écran, consultation obligatoire. */
export function RomeOverlay({ rome, offset, mode, era, onAck }: { rome: any; offset: number; mode: string; era: string; onAck: () => Promise<any> }) {
  const now = useNow(500);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const played = useRef<string | null>(null);
  useEffect(() => {
    if (rome && played.current !== rome.id) {
      played.current = rome.id;
      setOpened(false);
      playAlert();
    }
  }, [rome]);
  if (!rome) return null;
  const left = remaining(rome.deadline, offset, now);
  return (
    <EnvelopeReveal visible urgent label="COMMUNIQUÉ DE ROME — DIFFUSION IMMÉDIATE" stamp="URGENT" mode={mode} era={era} onOpened={() => setOpened(true)}
      footer={opened ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S(3), flexWrap: "wrap" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: "#5a4a3a" }}>Chronomètres suspendus · reprise au plus tard dans {fmtClock(left)}</Text>
          <Btn label="J'ai pris connaissance" busy={busy} onPress={async () => { setBusy(true); await onAck(); setBusy(false); }} accent="#7B1F1F" />
        </View>
      ) : null}>
      <DocLabel>Communiqué de Rome · {rome.dateline}</DocLabel>
      <DocTitle>{rome.title}</DocTitle>
      <DocText>{rome.body}</DocText>
      {rome.figures && Object.keys(rome.figures).length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>
          {Object.entries(rome.figures).map(([k, v]) => (
            <View key={k}><DocLabel>{k.replace(/_/g, " ")}</DocLabel><DocText small>{String(v)}</DocText></View>
          ))}
        </View>
      ) : null}
      <DocRule />
      <DocLabel>Impact général</DocLabel>
      <DocText>{rome.general_impact}</DocText>
      {rome.mine?.length ? (
        <>
          <DocRule />
          <DocLabel>Conséquences pour votre délégation</DocLabel>
          {rome.mine.map((l: string) => <DocText key={l}>— {l}</DocText>)}
        </>
      ) : null}
      {rome.per_actor ? (
        <>
          <DocRule />
          <DocLabel>Conséquences par acteur (Président)</DocLabel>
          {Object.entries(rome.per_actor).map(([a, lines]: any) => <DocText key={a} small>{a} : {lines.join(" ")}</DocText>)}
        </>
      ) : null}
    </EnvelopeReveal>
  );
}
