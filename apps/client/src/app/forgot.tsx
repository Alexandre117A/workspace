import { useState } from "react";
import { AuthFrame, FormButton, FormLink, FormNotice, FormTitle, LightField } from "../components/AuthKit";
import { api } from "../lib/api";
import { cleanMessage } from "../lib/auth";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Saisissez une adresse e-mail valide.");
    setBusy(true);
    try {
      await api("/auth/forgot", { body: { email: email.trim().toLowerCase() } });
      setDone(true);
    } catch (e: any) {
      setError(cleanMessage(e.message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="Mot de passe oublié ?" intro="Indiquez l'adresse de votre compte : si elle correspond à un compte, vous recevrez un lien temporaire pour choisir un nouveau mot de passe.">
      <FormTitle kicker="Récupération du compte" title="Réinitialiser mon mot de passe" />
      {done ? (
        <FormNotice tone="ok">Si cette adresse correspond à un compte GEONEX, un e-mail contenant un lien de réinitialisation vient de lui être envoyé. Le lien expire dans une heure et ne peut servir qu'une fois. Pensez à vérifier vos courriers indésirables.</FormNotice>
      ) : (
        <>
          <LightField label="Adresse e-mail" value={email} onChangeText={setEmail} placeholder="vous@exemple.fr" keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Adresse e-mail" onSubmitEditing={submit} />
          {error ? <FormNotice tone="error">{error}</FormNotice> : null}
          <FormButton label="ENVOYER LE LIEN" onPress={submit} busy={busy} />
        </>
      )}
      <FormLink href="/auth?mode=login">← Retour à la connexion</FormLink>
    </AuthFrame>
  );
}
