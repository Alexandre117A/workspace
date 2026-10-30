import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { AuthFrame, FormButton, FormLink, FormNotice, FormTitle } from "../components/AuthKit";
import { api } from "../lib/api";
import { cleanMessage, useAuth } from "../lib/auth";

/** Page d'arrivée du lien de confirmation (adresse du compte ou nouvelle adresse). Le jeton est consommé une seule fois. */
export default function Verify() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"working" | "ok" | "change" | "error">("working");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!token) { setState("error"); setMessage("Ce lien est incomplet."); return; }
    api<{ kind: string }>("/auth/verify", { body: { token } })
      .then(async (r) => { setState(r.kind === "email_change" ? "change" : "ok"); if (user) await refresh().catch(() => undefined); })
      .catch((e) => { setState("error"); setMessage(cleanMessage(e.message)); });
  }, [token]);
  return (
    <AuthFrame title="Votre adresse e-mail." intro="Confirmer votre adresse nous permet de sécuriser votre compte et de vous prévenir des invitations.">
      <FormTitle kicker="Vérification" title={state === "error" ? "Lien non valide" : state === "working" ? "Vérification en cours…" : "Félicitations !"} />
      {state === "ok" ? <FormNotice tone="ok">Félicitations ! Votre compte GEONEX est désormais activé.</FormNotice> : null}
      {state === "change" ? <FormNotice tone="ok">Votre nouvelle adresse e-mail est confirmée et remplace l'ancienne.</FormNotice> : null}
      {state === "error" ? <FormNotice tone="error">{message || "Ce lien est invalide ou a expiré."} Vous pouvez en demander un nouveau depuis votre espace, onglet Profil.</FormNotice> : null}
      {state !== "working" ? <FormButton label={user ? "ACCÉDER À MON ESPACE GEONEX" : "SE CONNECTER"} onPress={() => router.replace(user ? "/space" : "/auth?mode=login")} /> : null}
      <FormLink href="/">Retour à l'accueil</FormLink>
    </AuthFrame>
  );
}
