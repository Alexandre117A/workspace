import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AuthFrame, FormButton, FormNotice, FormTitle } from "../components/AuthKit";
import { api } from "../lib/api";
import { cleanMessage, useAuth } from "../lib/auth";
import { C, F, S } from "../theme";

/** Confirmation d'inscription : l'état de l'e-mail affiché est l'état réel (envoyé, échec, ou envoi non configuré sur ce serveur). */
export default function Welcome() {
  const { status, email, next } = useLocalSearchParams<{ status?: string; email?: string; next?: string }>();
  const { user, refresh } = useAuth();
  const [state, setState] = useState<string>(typeof status === "string" ? status : "skipped");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const go = typeof next === "string" && next.startsWith("/") ? next : "/space";

  const resend = async () => {
    setBusy(true);
    setInfo(null);
    try {
      const r = await api<{ status: string }>("/auth/resend-verification", { body: {} });
      setState(r.status);
      if (r.status === "already") { await refresh(); setInfo("Votre adresse est déjà confirmée."); }
    } catch (e: any) {
      setInfo(cleanMessage(e.message));
    } finally {
      setBusy(false);
    }
  };

  const verified = !!user?.emailVerified || state === "already";
  return (
    <AuthFrame title={user ? `Bienvenue, ${user.displayName}.` : "Bienvenue sur GEONEX."} intro="Votre compte est créé. Voici comment l'activer et par où commencer.">
      <FormTitle kicker="Compte créé" title="Votre inscription a bien été prise en compte" />
      {verified ? (
        <FormNotice tone="ok">Votre adresse e-mail est confirmée : votre compte est activé.</FormNotice>
      ) : state === "sent" ? (
        <FormNotice tone="ok">Un e-mail de bienvenue a été envoyé à {email}. Il contient le lien qui confirme votre adresse (valable 48 heures). Pensez à vérifier vos courriers indésirables.</FormNotice>
      ) : state === "failed" ? (
        <FormNotice tone="warn">Votre compte est bien créé, mais l'e-mail de bienvenue n'a pas pu être envoyé pour le moment. Vous pouvez réessayer ci-dessous.</FormNotice>
      ) : (
        <FormNotice tone="warn">Votre compte est bien créé. L'envoi d'e-mails n'est pas encore activé sur ce serveur : aucun message n'a été envoyé, et la confirmation de l'adresse n'est donc pas encore possible. Vous pouvez utiliser GEONEX normalement.</FormNotice>
      )}
      {!verified && state !== "skipped" ? <FormButton ghost label="RENVOYER L'E-MAIL" onPress={resend} busy={busy} /> : null}
      {info ? <FormNotice tone="info">{info}</FormNotice> : null}
      <View style={{ gap: S(2) }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 2, color: "#7A6428", textTransform: "uppercase" }}>Pour commencer</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 21, color: "#1B2430" }}>Découvrez les scénarios disponibles, rejoignez une session avec un code ou une invitation, ou créez votre propre simulation.</Text>
      </View>
      <FormButton label="ACCÉDER À MON ESPACE GEONEX" onPress={() => router.replace(go as any)} />
      <FormButton ghost label="EXPLORER LES SCÉNARIOS" onPress={() => router.replace("/library")} />
    </AuthFrame>
  );
}
