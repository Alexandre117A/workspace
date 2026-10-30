import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Wordmark } from "../components/Brand";
import { Body, Btn, Chip, Field, H1, Label, Notice, Screen } from "../components/ui";
import { useAuth } from "../lib/auth";
import { C, S } from "../theme";

export default function Auth() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const auth = useAuth();
  const [tab, setTab] = useState<"guest" | "login" | "register">("guest");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (tab === "guest") await auth.guest(name);
      else if (tab === "login") await auth.login(email, password);
      else await auth.register(email, password, name);
      router.replace((next as any) || "/");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen max={560}>
      <View style={{ gap: S(6), paddingTop: S(6) }}>
        <Wordmark size={16} />
        <H1>Identification</H1>
        <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
          <Chip label="Invité" active={tab === "guest"} onPress={() => setTab("guest")} />
          <Chip label="Connexion" active={tab === "login"} onPress={() => setTab("login")} />
          <Chip label="Créer un compte" active={tab === "register"} onPress={() => setTab("register")} />
        </View>
        {tab === "guest" ? (
          <Body muted>Participez immédiatement sous un nom d'emprunt. Vous pourrez ensuite enregistrer ce profil avec une adresse email pour retrouver vos créations et archives sur d'autres appareils.</Body>
        ) : (
          <Body muted>Un compte conserve vos simulations, vos sessions et vos archives sur tous vos appareils.</Body>
        )}
        <View style={{ gap: S(4) }}>
          {tab !== "login" ? <Field label="Nom affiché" value={name} onChangeText={setName} placeholder="Ex. Délégation Nord" maxLength={40} autoComplete="nickname" /> : null}
          {tab !== "guest" ? (
            <>
              <Field label="Adresse email" value={email} onChangeText={setEmail} placeholder="vous@exemple.fr" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              <Field label="Mot de passe" value={password} onChangeText={setPassword} placeholder="10 caractères minimum" secureTextEntry autoComplete={tab === "login" ? "current-password" : "new-password"} onSubmitEditing={submit} />
            </>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Btn label={tab === "guest" ? "Entrer" : tab === "login" ? "Se connecter" : "Créer le compte"} onPress={submit} busy={busy} />
        </View>
        <Label color={C.faint}>La connexion Apple et Google pourra être ajoutée lors de la publication sur les plateformes.</Label>
      </View>
    </Screen>
  );
}
