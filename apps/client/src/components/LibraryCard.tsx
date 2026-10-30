import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ThumbMap, thumbOf } from "../atlas/home/ScenarioSection";
import { LibItem, MODE_NAMES, useScenarioActions } from "../lib/library";
import { cleanMessage } from "../lib/auth";
import { C, F, MODE_STYLE, S } from "../theme";

const FADE: any = Platform.OS === "web" ? { transitionProperty: "transform, border-color, background-color", transitionDuration: "260ms", transitionTimingFunction: "ease" } : {};
const PUB: Record<string, string> = { none: "Privé", pending: "En attente de validation", published: "Publié", rejected: "Refusé" };

export function Chipline({ children, color = C.muted }: { children: string; color?: string }) {
  return <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 1.8, color, textTransform: "uppercase" }}>{children}</Text>;
}

/** Fiche de scénario : carte du théâtre, métadonnées réelles, actions. Les boutons ne s'affichent que s'ils mènent quelque part. */
export function LibraryCard({ item, width, reload, compact }: { item: LibItem; width: number; reload?: () => void; compact?: boolean }) {
  const m = MODE_STYLE[item.mode];
  const { toggleFavorite, start } = useScenarioActions(reload);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detail = `/scenario?key=${encodeURIComponent(item.key)}`;
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); } catch (e: any) { setError(cleanMessage(e.message)); } finally { setBusy(false); } };
  const shown = item.actors.slice(0, 4);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${item.title}. ${item.startLabel}. Voir les détails`} onPress={() => router.push(detail as any)}
      style={({ hovered }: any) => [{ width, borderWidth: 1, borderColor: hovered ? m.accent : C.lineHi, borderTopWidth: 3, borderTopColor: m.accent, backgroundColor: C.panel, overflow: "hidden" }, FADE, hovered ? { transform: [{ scale: 1.012 }] } : null]}>
      {({ hovered }: any) => (
        <>
          <ThumbMap e={thumbOf(item)} width={width - 2} height={compact ? 110 : Math.round(width * 0.42)} hovered={!!hovered} />
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !!item.favorite }} accessibilityLabel={item.favorite ? "Retirer des favoris" : "Enregistrer ce scénario"} disabled={busy}
            onPress={() => run(() => toggleFavorite(item, detail))} style={{ position: "absolute", right: 10, top: 10, width: 34, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: "#0B1420D9", borderWidth: 1, borderColor: item.favorite ? C.brass : C.lineHi }}>
            <Text style={{ fontSize: 18, color: item.favorite ? C.brass : C.muted }}>{item.favorite ? "★" : "☆"}</Text>
          </Pressable>
          <View style={{ padding: S(4), gap: S(2), flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <Chipline color={m.accent}>{`${MODE_NAMES[item.mode]} · ${item.eraLabel}`}</Chipline>
              <Chipline color={C.faint}>{item.source === "official" ? "Fiche officielle" : item.source === "community" ? `Proposé par ${item.author}` : item.publication && item.publication.status !== "none" ? PUB[item.publication.status] ?? "Privé" : "Mon scénario · privé"}</Chipline>
            </View>
            <Text style={{ fontFamily: F.title, fontSize: 23, lineHeight: 26, color: C.text }}>{item.title}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.brass }}>{item.startLabel}</Text>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>{item.regionGroup}{item.region ? ` · ${item.region}` : ""}</Text>
            {!compact ? <Text numberOfLines={3} style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 19, color: C.muted }}>{item.summary}</Text> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {shown.map((a) => <View key={a.id} style={{ borderWidth: 1, borderColor: C.lineHi, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.text }}>{a.name}</Text></View>)}
              {item.actors.length > shown.length ? <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint, alignSelf: "center" }}>+{item.actors.length - shown.length}</Text> : null}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{item.actors.length} acteurs · {item.zones} zones · {item.complexity}</Text>
            {error ? <Text accessibilityRole="alert" style={{ fontFamily: F.sans, fontSize: 12.5, color: C.red }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(2), marginTop: "auto", paddingTop: S(2) }}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => run(() => start(item, detail))} style={({ hovered: h }: any) => ({ backgroundColor: h ? "#CBAE72" : C.brass, paddingVertical: 10, paddingHorizontal: 14, opacity: busy ? 0.6 : 1 })}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.8, color: "#1B1608" }}>COMMENCER UNE SIMULATION</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => run(() => toggleFavorite(item, detail))} style={({ hovered: h }: any) => ({ borderWidth: 1, borderColor: h ? C.text : C.lineHi, paddingVertical: 10, paddingHorizontal: 12 })}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 1.6, color: C.text }}>{item.favorite ? "RETIRER DES FAVORIS" : "ENREGISTRER"}</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}
