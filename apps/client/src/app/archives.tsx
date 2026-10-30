import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Body, H1, Label, Loading, Notice, Panel, Screen } from "../components/ui";
import { api } from "../lib/api";
import { useRequireAuth } from "../lib/hooks";
import { C, F, MODE_STYLE, S } from "../theme";

export default function Archives() {
  const user = useRequireAuth("/archives");
  const [items, setItems] = useState<any[] | null>(null);
  const [active, setActive] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    api("/archives").then(setItems).catch((e) => setError(e.message));
    api("/sessions/mine").then((s: any[]) => setActive(s.filter((x) => ["lobby", "dossier", "running"].includes(x.status)))).catch(() => undefined);
  }, [user]);
  if (!user) return null;
  return (
    <Screen max={900}>
      <View style={{ gap: S(5) }}>
        <Pressable onPress={() => router.push("/")}><Label>← Accueil</Label></Pressable>
        <H1>Archives</H1>
        {active.length ? (
          <Panel title="Sessions en cours" accent={C.green}>
            {active.map((s) => (
              <Pressable key={s.id} onPress={() => router.push(`/session/${s.id}`)}>
                <Body>{s.name} <Text style={{ color: C.muted }}>· {s.role === "president" ? "Président de séance" : "équipe"} · {s.status === "lobby" ? "salon d'attente" : "en jeu"}</Text></Body>
              </Pressable>
            ))}
          </Panel>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!items ? <Loading /> : items.length === 0 ? <Body muted>Aucune simulation terminée pour l'instant.</Body> : null}
        {items?.map((it) => (
          <Pressable key={it.id} onPress={() => router.push({ pathname: "/results/[id]", params: { id: it.id, replay: "0" } })}
            style={({ hovered }: any) => ({ borderWidth: 1, borderColor: hovered ? C.brass : C.line, backgroundColor: C.panel, padding: S(4), gap: S(2) })}>
            <Label color={MODE_STYLE[it.mode as keyof typeof MODE_STYLE]?.accent ?? C.muted}>{MODE_STYLE[it.mode as keyof typeof MODE_STYLE]?.label} · {new Date(it.finished_at).toLocaleDateString("fr-FR")}</Label>
            <Text style={{ fontFamily: F.title, fontSize: 24, color: C.text }}>{it.name}</Text>
            <Body muted style={{ fontSize: 13.5 }}>{it.rounds} rounds · vainqueur : {it.winner?.name ?? "—"} ({it.winner?.qualification ?? ""})</Body>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
