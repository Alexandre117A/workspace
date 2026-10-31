import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AuthFrame, FormButton, FormNotice, FormTitle } from "../components/AuthKit";
import { useAuth } from "../lib/auth";
import { F, S } from "../theme";

/** Confirmation d'inscription. GEONEX n'envoie aucun e-mail : le compte est utilisable immédiatement. */
export default function Welcome() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { user } = useAuth();
  const go = typeof next === "string" && next.startsWith("/") ? next : "/space";
  return (
    <AuthFrame title={user ? `Bienvenue, ${user.displayName}.` : "Bienvenue sur GEONEX."} intro="Votre compte est créé et prêt à l'emploi.">
      <FormTitle kicker="Compte créé" title="Votre inscription a bien été prise en compte" />
      <FormNotice tone="ok">Aucune confirmation n'est nécessaire : GEONEX n'envoie pas d'e-mails. Notez bien votre mot de passe, car il ne peut pas être récupéré par e-mail ; vous pouvez le changer à tout moment depuis Mon espace, Mon profil.</FormNotice>
      <View style={{ gap: S(2) }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 2, color: "#7A6428", textTransform: "uppercase" }}>Pour commencer</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 21, color: "#1B2430" }}>Découvrez les scénarios disponibles, rejoignez une session avec un code ou une invitation, ou créez votre propre simulation.</Text>
      </View>
      <FormButton label="ACCÉDER À MON ESPACE GEONEX" onPress={() => router.replace(go as any)} />
      <FormButton ghost label="EXPLORER LES SCÉNARIOS" onPress={() => router.replace("/library")} />
    </AuthFrame>
  );
}
