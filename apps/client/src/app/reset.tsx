import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { passwordIssues } from "@geonex/shared";
import { AuthFrame, FormButton, FormLink, FormNotice, FormTitle, PasswordChecklist, PasswordField } from "../components/AuthKit";
import { api } from "../lib/api";
import { cleanMessage } from "../lib/auth";

/** Choix d'un nouveau mot de passe depuis le lien reçu par e-mail (temporaire, à usage unique). */
export default function Reset() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (passwordIssues(password).length) return setError("Votre mot de passe ne respecte pas les exigences de sécurité.");
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas.");
    setBusy(true);
    try {
      await api("/auth/reset", { body: { token, password, passwordConfirm: confirm } });
      setDone(true);
    } catch (e: any) {
      setError(cleanMessage(e.message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="Un nouveau mot de passe." intro="Choisissez-en un que vous n'utilisez nulle part ailleurs. Toutes vos sessions ouvertes seront déconnectées par précaution.">
      <FormTitle kicker="Récupération du compte" title="Nouveau mot de passe" />
      {!token ? (
        <FormNotice tone="error">Ce lien est incomplet. Demandez un nouveau lien de réinitialisation.</FormNotice>
      ) : done ? (
        <>
          <FormNotice tone="ok">Votre mot de passe a été modifié. Vous pouvez vous reconnecter.</FormNotice>
          <FormButton label="SE CONNECTER" onPress={() => router.replace("/auth?mode=login")} />
        </>
      ) : (
        <>
          <PasswordField label="Nouveau mot de passe" value={password} onChangeText={setPassword} />
          <PasswordChecklist value={password} />
          <PasswordField label="Confirmation" value={confirm} onChangeText={setConfirm} />
          {error ? <FormNotice tone="error">{error}</FormNotice> : null}
          <FormButton label="ENREGISTRER LE MOT DE PASSE" onPress={submit} busy={busy} />
        </>
      )}
      <FormLink href="/forgot">Demander un nouveau lien</FormLink>
    </AuthFrame>
  );
}
