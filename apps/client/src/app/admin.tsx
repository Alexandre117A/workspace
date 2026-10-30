import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Body, H1, Label, Loading, Notice, Panel, Screen } from "../components/ui";
import { api } from "../lib/api";
import { useRequireAuth } from "../lib/hooks";
import { S } from "../theme";

/** Administration globale (rôle propriétaire uniquement, vérifié côté serveur). */
export default function Admin() {
  const user = useRequireAuth("/admin");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (user) api("/admin/overview").then(setData).catch((e) => setError(e.message));
  }, [user]);
  if (!user) return null;
  return (
    <Screen max={900}>
      <View style={{ gap: S(5) }}>
        <Pressable onPress={() => router.push("/account")}><Label>← Compte</Label></Pressable>
        <H1>Administration</H1>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!data && !error ? <Loading /> : null}
        {data ? (
          <>
            <Panel title="Utilisateurs"><Body>{data.users.accounts} comptes · {data.users.guests} profils invités</Body></Panel>
            <Panel title="Sessions">{data.sessions.map((s: any) => <Body key={s.status}>{s.status} : {s.n}</Body>)}</Panel>
            <Panel title="Consommation des services externes">
              {data.usage.map((u: any) => <Body key={u.service}>{u.service} : {Math.round(u.units)} unité(s) · {Number(u.cost || 0).toFixed(2)} $</Body>)}
              <Body>IA : {data.ai ? `${data.ai.calls} appels · ${data.ai.cost_usd.toFixed(3)} $ (processus moteur courant)` : "indisponible"}</Body>
            </Panel>
            <Panel title="Monétisation"><Body>Publicités : {data.monetization.ads.enabled ? "activées" : "désactivées (par défaut)"}</Body></Panel>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
