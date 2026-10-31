import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { api } from "../lib/api";
import { cleanMessage } from "../lib/auth";
import { C, F, S } from "../theme";

const STATUS: Record<string, [string, string]> = { pending: ["En attente", C.amber], accepted: ["Acceptée", C.green], declined: ["Refusée", C.red], revoked: ["Révoquée", C.faint], expired: ["Expirée", C.faint] };
const KIND: Record<string, string> = { user: "Joueur", link: "Lien" };

function Btn({ label, onPress, busy, ghost }: { label: string; onPress: () => void; busy?: boolean; ghost?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={({ hovered }: any) => ({ paddingVertical: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: ghost ? C.lineHi : C.brass, backgroundColor: ghost ? "transparent" : hovered ? "#CBAE72" : C.brass, opacity: busy ? 0.6 : 1 })}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.6, color: ghost ? C.text : "#1B1608" }}>{label}</Text>
    </Pressable>
  );
}

function Input({ value, onChange, placeholder, label, kb }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; kb?: any }) {
  return <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.faint} accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} keyboardType={kb} style={{ flex: 1, minWidth: 180, color: C.text, fontFamily: F.sans, fontSize: 14.5, backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, paddingHorizontal: 12, paddingVertical: 11, ...({ outlineStyle: "none" } as any) }} />;
}

/** Invitations d'une session (en complément du code de participation) : par pseudonyme ou par lien ; suivi et révocation. */
export function InvitePanel({ sessionId }: { sessionId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [pseudo, setPseudo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(() => api<any[]>(`/space/sessions/${sessionId}/invitations`).then(setList).catch(() => undefined), [sessionId]);
  useEffect(() => { load(); }, [load]);

  const send = async (body: any, ok: (r: any) => string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<any>(`/space/sessions/${sessionId}/invitations`, { body });
      setLink(r.link ?? null);
      setMsg({ tone: "ok", text: ok(r) });
      setPseudo("");
      load();
    } catch (e: any) {
      setMsg({ tone: "error", text: cleanMessage(e.message) });
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (link && Platform.OS === "web") { try { await navigator.clipboard.writeText(link); setMsg({ tone: "ok", text: "Lien copié." }); } catch { /* le lien reste affiché */ } }
  };
  const revoke = async (id: string) => { try { await api(`/space/sessions/${sessionId}/invitations/${id}`, { method: "DELETE" }); load(); } catch (e: any) { setMsg({ tone: "error", text: cleanMessage(e.message) }); } };

  return (
    <View style={{ gap: S(3), borderTopWidth: 1, borderTopColor: C.line, paddingTop: S(3) }}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 2, color: C.brass, textTransform: "uppercase" }}>Inviter des joueurs</Text>
      <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
        <Input value={pseudo} onChange={setPseudo} placeholder="Pseudonyme exact du joueur" label="Pseudonyme à inviter" />
        <Btn label="INVITER" busy={busy || !pseudo.trim()} onPress={() => send({ pseudonym: pseudo.trim() }, (r) => `Invitation envoyée à ${r.to}.`)} />
      </View>
      <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
        <Btn ghost label="GÉNÉRER UN LIEN" busy={busy} onPress={() => send({ link: true }, () => "Lien créé : quiconque l'ouvre peut rejoindre la session, jusqu'à révocation (7 jours).")} />
      </View>
      {link ? (
        <View style={{ gap: 6 }}>
          <Text selectable style={{ fontFamily: F.mono, fontSize: 12, color: C.text, backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, padding: 10 }}>{link}</Text>
          {Platform.OS === "web" ? <Pressable accessibilityRole="button" onPress={copy}><Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.6, color: C.brass }}>COPIER LE LIEN</Text></Pressable> : null}
        </View>
      ) : null}
      {msg ? <Text accessibilityRole="alert" style={{ fontFamily: F.sans, fontSize: 13, color: msg.tone === "ok" ? C.green : C.red }}>{msg.text}</Text> : null}
      {list.length ? (
        <View style={{ gap: 6 }}>
          {list.map((i) => {
            const [label, color] = STATUS[i.status] ?? [i.status, C.faint];
            return (
              <View key={i.id} style={{ flexDirection: "row", alignItems: "center", gap: S(3), flexWrap: "wrap" }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.faint, width: 56 }}>{KIND[i.kind]}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 13.5, color: C.text, flex: 1, minWidth: 120 }}>{i.to}</Text>
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1.2, color, textTransform: "uppercase" }}>{label}</Text>
                {i.status === "pending" ? <Pressable accessibilityRole="button" accessibilityLabel="Révoquer cette invitation" onPress={() => revoke(i.id)}><Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1.2, color: C.red }}>RÉVOQUER</Text></Pressable> : null}
              </View>
            );
          })}
        </View>
      ) : <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>Aucune invitation envoyée pour cette session. Le code de participation reste utilisable.</Text>}
    </View>
  );
}
