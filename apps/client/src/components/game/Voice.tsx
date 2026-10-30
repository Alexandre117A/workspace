import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { api } from "../../lib/api";
import { C, F } from "../../theme";

/**
 * Canal vocal (LiveKit). Le serveur décide des droits de publication à chaque jeton :
 * en Assemblée, seule l'équipe qui a la parole peut émettre ; en Diplomatie, seuls les
 * deux interlocuteurs de l'appel rejoignent la salle. Aucun enregistrement n'est réalisé.
 *
 * ÉTAT : intégration web écrite et vérifiée au typage uniquement — non testée avec un serveur
 * LiveKit réel (aucune clé disponible). Sur iPhone/iPad, l'audio natif exige une build de
 * développement (@livekit/react-native) : non incluse, le canal écrit reste utilisé.
 */
export function VoiceChannel({ sessionId, channel, enabled, speaking, roomKey }: {
  sessionId: string; channel: "assembly" | "call"; enabled: boolean; speaking: boolean; roomKey: string;
}) {
  const [status, setStatus] = useState<string>("");
  const [mic, setMic] = useState(false);
  const roomRef = useRef<any>(null);
  const web = Platform.OS === "web";

  useEffect(() => {
    if (!enabled || !web) return;
    let cancelled = false;
    (async () => {
      try {
        const grant = await api<{ url: string; token: string; canPublish: boolean }>(`/sessions/${sessionId}/audio-token`, { body: { channel } });
        const { Room, RoomEvent, Track } = await import("livekit-client");
        if (cancelled) return;
        const room = new Room({ adaptiveStream: true });
        roomRef.current = room;
        room.on(RoomEvent.TrackSubscribed, (track: any) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach() as HTMLAudioElement;
            el.autoplay = true;
            document.body.appendChild(el);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track: any) => track.detach().forEach((el: HTMLElement) => el.remove()));
        room.on(RoomEvent.Disconnected, () => setStatus("Voix déconnectée"));
        await room.connect(grant.url, grant.token);
        if (cancelled) return room.disconnect();
        setStatus(grant.canPublish ? "Voix connectée — vous pouvez parler" : "Voix connectée — écoute");
        if (grant.canPublish && speaking) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMic(true);
          } catch {
            setStatus("Micro refusé par le navigateur : utilisez le canal écrit");
          }
        }
      } catch (e: any) {
        if (!cancelled) setStatus(`Voix indisponible (${e.message ?? "erreur"}) : utilisez le canal écrit`);
      }
    })();
    return () => {
      cancelled = true;
      setMic(false);
      const room = roomRef.current;
      roomRef.current = null;
      try {
        room?.disconnect();
      } catch {
        /* déjà fermé */
      }
    };
    // roomKey change quand l'orateur ou l'appel change : un nouveau jeton (droits recalculés par le serveur) est demandé.
  }, [enabled, web, sessionId, channel, roomKey, speaking]);

  if (!enabled) return null;
  if (!web) return <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>Audio natif : nécessite une build de développement — canal écrit utilisé.</Text>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mic ? C.red : status.startsWith("Voix connectée") ? C.green : C.faint }} />
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted }}>{mic ? "Micro actif · " : ""}{status || "Connexion à la voix…"}</Text>
    </View>
  );
}
