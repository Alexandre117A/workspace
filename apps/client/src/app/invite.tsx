import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AuthFrame, FormButton, FormLink, FormNotice, FormTitle } from "../components/AuthKit";
import { api } from "../lib/api";
import { cleanMessage, useAuth } from "../lib/auth";
import { C, F, S } from "../theme";

/** Lien d'invitation : aperçu public, puis, une fois connecté, admission dans la session (mêmes règles que le code de participation). */
export default function Invite() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { user, ready } = useAuth();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/invite?token=${encodeURIComponent(String(token ?? ""))}`;

  useEffect(() => {
    if (!token) return setError("Ce lien d'invitation est incomplet.");
    api(`/invitations/link/${encodeURIComponent(String(token))}`).then(setInfo).catch((e) => setError(cleanMessage(e.message)));
  }, [token]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sessionId: string }>(`/invitations/link/${encodeURIComponent(String(token))}/accept`, { body: {} });
      router.replace(`/session/${r.sessionId}`);
    } catch (e: any) {
      setError(cleanMessage(e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Vous êtes invité." intro="Une simulation GEONEX vous attend. Connectez-vous, ou créez un compte gratuit, pour la rejoindre.">
      <FormTitle kicker="Invitation à une simulation" title={info ? info.session.name : "Invitation"} />
      {info ? (
        <View style={{ gap: S(2) }}>
          <Text style={{ fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: C.ink }}>{info.from} vous invite à participer à cette simulation ({info.session.scenario}).</Text>
          {!info.valid ? <FormNotice tone="warn">{info.reason}</FormNotice> : null}
        </View>
      ) : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {info?.valid ? (
        ready && user ? <FormButton label="REJOINDRE LA SIMULATION" onPress={join} busy={busy} /> : (
          <>
            <FormButton label="SE CONNECTER POUR REJOINDRE" onPress={() => router.push({ pathname: "/auth", params: { mode: "login", next: here } })} />
            <FormButton ghost label="CRÉER UN COMPTE GRATUIT" onPress={() => router.push({ pathname: "/auth", params: { mode: "register", next: here } })} />
          </>
        )
      ) : null}
      <FormLink href="/">Retour à l'accueil</FormLink>
    </AuthFrame>
  );
}
