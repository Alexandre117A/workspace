import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatJoinCode } from "@geonex/shared";
import { Btn, Field, H1, Notice, Screen } from "../components/ui";
import { api } from "../lib/api";
import { useRequireAuth } from "../lib/hooks";
import { S } from "../theme";

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const user = useRequireAuth(`/join${params.code ? `?code=${params.code}` : ""}`);
  const [code, setCode] = useState(formatJoinCode(params.code ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sessionId: string }>("/sessions/join", { body: { code } });
      router.replace(`/session/${r.sessionId}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  useEffect(() => {
    if (user && params.code) join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;
  return (
    <Screen max={560}>
      <View style={{ gap: S(5), paddingTop: S(8) }}>
        <H1>Rejoindre une session</H1>
        <Field value={code} onChangeText={(t) => setCode(formatJoinCode(t))} placeholder="XXXXX-XXXXX" autoCapitalize="characters" onSubmitEditing={join} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Btn label="Rejoindre" onPress={join} busy={busy} />
      </View>
    </Screen>
  );
}
