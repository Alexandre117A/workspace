import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Body, Btn, Field, H1, Label, Notice, Panel, Screen } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRequireAuth } from "../lib/hooks";
import { C, S } from "../theme";

export default function Account() {
  const user = useRequireAuth("/account");
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!user) return null;
  return (
    <Screen max={640}>
      <View style={{ gap: S(5) }}>
        <Pressable onPress={() => router.push("/")}><Label>← Accueil</Label></Pressable>
        <H1>{user.displayName}</H1>
        <Label color={C.muted}>{user.isGuest ? "Profil invité" : user.email}{user.role === "owner" ? " · propriétaire de GEONEX" : ""}</Label>
        {user.isGuest ? (
          <Panel title="Enregistrer ce profil">
            <Body muted style={{ fontSize: 14 }}>Associez une adresse email pour retrouver vos simulations et archives sur tous vos appareils.</Body>
            <Field label="Adresse email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry placeholder="10 caractères minimum" />
            <Btn label="Enregistrer" onPress={async () => { try { await auth.upgrade(email, password); setMsg({ tone: "ok", text: "Compte enregistré." }); } catch (e: any) { setMsg({ tone: "error", text: e.message }); } }} />
          </Panel>
        ) : null}
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <View style={{ flexDirection: "row", gap: S(2), flexWrap: "wrap" }}>
          <Btn variant="ghost" label="Archives" onPress={() => router.push("/archives")} />
          {user.role === "owner" ? <Btn variant="ghost" label="Administration" onPress={() => router.push("/admin")} /> : null}
          <Btn variant="ghost" label="Se déconnecter" onPress={async () => { await auth.logout(); router.replace("/"); }} />
        </View>
        <Panel title="Données personnelles" accent={C.red}>
          <Body muted style={{ fontSize: 13.5 }}>Vous pouvez supprimer votre compte. Vos informations d'identification sont effacées ; les archives de parties partagées avec d'autres participants sont conservées sous forme anonymisée.</Body>
          {confirmDelete ? (
            <Btn variant="danger" label="Confirmer la suppression définitive" onPress={async () => { await api("/auth/me", { method: "DELETE" }); await auth.logout(); router.replace("/"); }} />
          ) : (
            <Btn variant="quiet" label="Supprimer mon compte" onPress={() => setConfirmDelete(true)} />
          )}
        </Panel>
      </View>
    </Screen>
  );
}
