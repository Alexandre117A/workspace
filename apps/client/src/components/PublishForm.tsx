import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api } from "../lib/api";
import { cleanMessage } from "../lib/auth";
import { C, F, S } from "../theme";

/** Proposer un scénario à la bibliothèque publique. Il reste privé tant qu'il n'a pas été validé : rien n'est publié automatiquement. */
export function PublishForm({ scenario, onDone }: { scenario: { id: string; title: string }; onDone: () => void }) {
  const [title, setTitle] = useState(scenario.title);
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (title.trim().length < 5) return setError("Le titre doit comporter au moins 5 caractères.");
    if (description.trim().length < 40) return setError("La description doit être compréhensible : 40 caractères au moins.");
    setBusy(true);
    try {
      const r = await api<{ status: string }>(`/publications/${scenario.id}`, { body: { title: title.trim(), description: description.trim(), keywords: keywords.split(",").map((k) => k.trim()).filter((k) => k.length > 1).slice(0, 8) } });
      setResult(r.status === "published" ? "Votre scénario est publié dans le Centre des scénarios." : "Votre proposition est enregistrée : elle sera relue avant d'apparaître dans la bibliothèque. D'ici là, votre scénario reste privé.");
      onDone();
    } catch (e: any) {
      setError(cleanMessage(e.message));
    } finally {
      setBusy(false);
    }
  };
  const input = (v: string, set: (x: string) => void, label: string, multi = false, ph = "") => (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2, color: C.faint, textTransform: "uppercase" }}>{label}</Text>
      <TextInput value={v} onChangeText={set} multiline={multi} placeholder={ph} placeholderTextColor={C.faint} accessibilityLabel={label} maxLength={multi ? 2000 : 120}
        style={{ color: C.text, fontFamily: F.sans, fontSize: 14.5, backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, padding: 11, minHeight: multi ? 110 : 44, textAlignVertical: multi ? "top" : "center", ...({ outlineStyle: "none" } as any) }} />
    </View>
  );
  if (result) return <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 21, color: C.green }}>{result}</Text>;
  return (
    <View style={{ gap: S(3), borderTopWidth: 1, borderTopColor: C.line, paddingTop: S(3) }}>
      <Text style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 19, color: C.muted }}>Un scénario public doit avoir un titre et une description clairs, sans contenu abusif ni illégal. GEONEX ne le valide pas historiquement : il apparaîtra comme « proposé par la communauté ». L'époque, la région et les acteurs sont repris du scénario.</Text>
      {input(title, setTitle, "Titre")}
      {input(description, setDescription, "Description (40 caractères au moins)", true, "Que simule ce scénario ? Quelle situation de départ, quels enjeux ?")}
      {input(keywords, setKeywords, "Mots-clés (séparés par des virgules)", false, "ex. détroit, énergie, alliance")}
      {error ? <Text accessibilityRole="alert" style={{ fontFamily: F.sans, fontSize: 13, color: C.red }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={{ alignSelf: "flex-start", backgroundColor: C.brass, paddingVertical: 12, paddingHorizontal: 18, opacity: busy ? 0.6 : 1 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: "#1B1608" }}>PROPOSER À LA BIBLIOTHÈQUE</Text>
      </Pressable>
    </View>
  );
}
