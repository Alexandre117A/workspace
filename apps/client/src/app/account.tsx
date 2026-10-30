import { Redirect } from "expo-router";

/** L'ancienne page de compte est désormais l'onglet « Mon profil » de Mon espace. */
export default function Account() {
  return <Redirect href="/space?tab=profile" />;
}
