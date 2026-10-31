import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { pseudonymIssues } from "@geonex/shared";
import { AuthFrame, FormButton, FormLink, FormNotice, FormTitle, LightField, PasswordChecklist, PasswordField } from "../components/AuthKit";
import { api } from "../lib/api";
import { cleanMessage, useAuth } from "../lib/auth";
import { C, F, S } from "../theme";
import { passwordIssues } from "@geonex/shared";

type Mode = "login" | "register" | "guest";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Accès au compte GEONEX. Après connexion ou inscription, on revient à l'action qui était demandée (paramètre `next`),
 * sinon à l'espace personnel. `?mode=register|login` choisit l'onglet ; l'accès invité reste possible mais discret.
 */
export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string; next?: string; email?: string }>();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(params.mode === "login" ? "login" : "register");
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pseudonym, setPseudonym] = useState("");
  const [remember, setRemember] = useState(true);
  const [terms, setTerms] = useState(false);
  const [avail, setAvail] = useState<{ ok: boolean; text: string } | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => { setError(null); setTouched(false); }, [mode]);
  useEffect(() => {
    if (auth.ready && auth.user && !auth.user.isGuest && !busy) router.replace((next as any) ?? "/");
  }, [auth.ready, auth.user?.id]);

  // Disponibilité du pseudonyme, vérifiée au fil de la saisie (le pseudonyme est une identité publique, pas un secret).
  useEffect(() => {
    if (mode !== "register") return;
    const v = pseudonym.trim();
    if (!v) return setAvail(null);
    const issues = pseudonymIssues(v);
    if (issues.length) return setAvail({ ok: false, text: issues[0] });
    setAvail({ ok: true, text: "Vérification…" });
    const t = setTimeout(() => {
      api<{ available: boolean; reason?: string }>(`/auth/pseudonym?value=${encodeURIComponent(v)}`)
        .then((r) => setAvail({ ok: r.available, text: r.available ? "Ce pseudonyme est disponible." : r.reason ?? "Indisponible." }))
        .catch(() => setAvail(null));
    }, 450);
    return () => clearTimeout(t);
  }, [pseudonym, mode]);

  const problems = (): string | null => {
    if (!EMAIL_RE.test(email.trim())) return "Saisissez une adresse e-mail valide.";
    if (mode === "register") {
      const p = pseudonymIssues(pseudonym);
      if (p.length) return `Pseudonyme : ${p[0]}`;
      if (avail && !avail.ok) return avail.text;
      if (passwordIssues(password).length) return "Votre mot de passe ne respecte pas les exigences de sécurité.";
      if (password !== confirm) return "Les mots de passe ne correspondent pas.";
      if (!terms) return "Acceptez les conditions d'utilisation pour créer un compte.";
    }
    return null;
  };

  const submit = async () => {
    setTouched(true);
    setError(null);
    const bad = mode === "guest" ? (pseudonym.trim().length < 2 ? "Choisissez un nom (2 caractères au moins)." : null) : problems();
    if (mode === "login" && (!EMAIL_RE.test(email.trim()) || !password)) return setError("Saisissez votre adresse e-mail et votre mot de passe.");
    if (mode !== "login" && bad) return setError(bad);
    setBusy(true);
    try {
      if (mode === "login") {
        await auth.login(email.trim().toLowerCase(), password, remember);
        router.replace((next as any) ?? "/");
      } else if (mode === "guest") {
        await auth.guest(pseudonym.trim());
        router.replace((next as any) ?? "/");
      } else {
        const body = { email: email.trim().toLowerCase(), pseudonym: pseudonym.trim(), password, passwordConfirm: confirm, acceptTerms: true as const };
        const mail = auth.user?.isGuest ? await auth.upgrade(body) : await auth.register(body);
        router.replace({ pathname: "/welcome", params: { status: mail.status, email: body.email, ...(next ? { next } : {}) } });
      }
    } catch (e: any) {
      setError(cleanMessage(e.message));
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: Mode, label: string) => (
    <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)} style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: mode === m ? C.brass : "#D7CFBA" }}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: mode === m ? "#1B2430" : "#6B6A66", textTransform: "uppercase" }}>{label}</Text>
    </Pressable>
  );

  return (
    <AuthFrame title={mode === "register" ? "Rejoignez GEONEX." : mode === "login" ? "Bon retour sur GEONEX." : "Entrez dans la simulation."}
      intro={mode === "register" ? "Un compte conserve vos simulations, vos participations, vos favoris et vos invitations, sur tous vos appareils. Il est gratuit." : "Retrouvez vos simulations en cours, vos scénarios enregistrés et vos invitations."}>
      <View accessibilityRole="tablist" style={{ flexDirection: "row" }}>{tab("login", "Connexion")}{tab("register", "Créer un compte")}</View>
      {next ? <FormNotice tone="info">Connectez-vous ou créez un compte pour continuer : vous reviendrez directement à ce que vous vouliez faire.</FormNotice> : null}

      {mode === "login" ? (
        <>
          <FormTitle kicker="Connexion" title="Accéder à mon espace" />
          <LightField label="Adresse e-mail" value={email} onChangeText={setEmail} placeholder="vous@exemple.fr" keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Adresse e-mail" onSubmitEditing={submit} />
          <PasswordField label="Mot de passe" value={password} onChangeText={setPassword} autoComplete="current-password" />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: S(2) }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember(!remember)} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={{ width: 18, height: 18, borderWidth: 1.5, borderColor: "#41698B", backgroundColor: remember ? "#284D74" : "#fff", alignItems: "center", justifyContent: "center" }}>{remember ? <Text style={{ color: "#fff", fontSize: 12, lineHeight: 14 }}>✓</Text> : null}</View>
              <Text style={{ fontFamily: F.sans, fontSize: 13.5, color: "#1B2430" }}>Rester connecté 30 jours</Text>
            </Pressable>
            <FormLink href="/forgot">Mot de passe oublié ?</FormLink>
          </View>
          {error ? <FormNotice tone="error">{error}</FormNotice> : null}
          <FormButton label="SE CONNECTER" onPress={submit} busy={busy} />
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}><Text style={{ fontFamily: F.sans, fontSize: 13.5, color: "#4B5866" }}>Pas encore de compte ?</Text><Pressable accessibilityRole="link" onPress={() => setMode("register")}><Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: "#284D74", textDecorationLine: "underline" }}>Créer un compte</Text></Pressable></View>
        </>
      ) : null}

      {mode === "register" ? (
        <>
          <FormTitle kicker="Inscription gratuite" title="Créer mon compte" sub="Aucun abonnement, aucune publicité. Votre adresse sert aux seuls messages essentiels du compte." />
          <LightField label="Adresse e-mail" value={email} onChangeText={setEmail} placeholder="vous@exemple.fr" keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Adresse e-mail" />
          <View style={{ gap: 4 }}>
            <LightField label="Pseudonyme" value={pseudonym} onChangeText={setPseudonym} placeholder="Ex. Delegation.Nord" maxLength={24} autoCapitalize="none" autoComplete="username" accessibilityLabel="Pseudonyme" hint="Votre identité publique dans les simulations multijoueurs." />
            {avail ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: 11.5, color: avail.text === "Vérification…" ? "#6B6A66" : avail.ok ? "#2F6B37" : "#963F46" }}>{avail.ok && avail.text !== "Vérification…" ? "✓ " : avail.ok ? "" : "✕ "}{avail.text}</Text> : null}
          </View>
          <PasswordField label="Mot de passe" value={password} onChangeText={setPassword} error={touched && passwordIssues(password).length > 0} />
          <PasswordChecklist value={password} />
          <PasswordField label="Confirmation du mot de passe" value={confirm} onChangeText={setConfirm} error={touched && !!confirm && password !== confirm} />
          {confirm && password !== confirm ? <Text style={{ fontFamily: F.mono, fontSize: 11.5, color: "#963F46" }}>✕ Les mots de passe ne correspondent pas.</Text> : null}
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: terms }} onPress={() => setTerms(!terms)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ width: 20, height: 20, marginTop: 1, borderWidth: 1.5, borderColor: touched && !terms ? "#963F46" : "#41698B", backgroundColor: terms ? "#284D74" : "#fff", alignItems: "center", justifyContent: "center" }}>{terms ? <Text style={{ color: "#fff", fontSize: 13, lineHeight: 15 }}>✓</Text> : null}</View>
            <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 13.5, lineHeight: 19, color: "#1B2430" }}>J'accepte les <Text onPress={() => router.push("/terms")} style={{ color: "#284D74", textDecorationLine: "underline" }}>conditions d'utilisation</Text> et j'ai pris connaissance de la <Text onPress={() => router.push("/privacy")} style={{ color: "#284D74", textDecorationLine: "underline" }}>politique de confidentialité</Text>.</Text>
          </Pressable>
          {error ? <FormNotice tone="error">{error}</FormNotice> : null}
          <FormButton label="CRÉER MON COMPTE" onPress={submit} busy={busy} />
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}><Text style={{ fontFamily: F.sans, fontSize: 13.5, color: "#4B5866" }}>Déjà inscrit ?</Text><Pressable accessibilityRole="link" onPress={() => setMode("login")}><Text style={{ fontFamily: F.sansMed, fontSize: 13.5, color: "#284D74", textDecorationLine: "underline" }}>Se connecter</Text></Pressable></View>
        </>
      ) : null}

      {mode === "guest" ? (
        <>
          <FormTitle kicker="Profil temporaire" title="Essayer sans compte" sub="Participez sous un nom d'emprunt. Ce profil n'est pas protégé par un mot de passe : créez un compte ensuite pour le conserver." />
          <LightField label="Nom affiché" value={pseudonym} onChangeText={setPseudonym} placeholder="Ex. Délégation Nord" maxLength={40} accessibilityLabel="Nom affiché" onSubmitEditing={submit} />
          {error ? <FormNotice tone="error">{error}</FormNotice> : null}
          <FormButton label="ENTRER" onPress={submit} busy={busy} />
        </>
      ) : null}

    </AuthFrame>
  );
}
