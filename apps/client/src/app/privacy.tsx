import { Text, View } from "react-native";
import { PageScreen, Paper } from "../components/Page";
import { C, F, S } from "../theme";

const SECTIONS: [string, string[]][] = [
  ["Ce que GEONEX collecte", ["Compte : adresse e-mail, pseudonyme, empreinte chiffrée du mot de passe (jamais le mot de passe lui-même), date d'inscription, date de dernière connexion. L'adresse e-mail sert uniquement d'identifiant de connexion et n'est jamais vérifiée par message.", "Activité : scénarios que vous créez, sessions que vous organisez ou rejoignez, décisions et messages échangés pendant les parties, favoris, invitations, préférences (avatar, notifications, possibilité d'être invité par pseudonyme).", "Technique : en mémoire seulement, l'adresse IP pour limiter les tentatives abusives. Aucun outil de mesure d'audience ni de suivi publicitaire n'est utilisé."]],
  ["À quoi servent ces données", ["À faire fonctionner votre compte et vos parties, et à protéger le service contre les abus. GEONEX n'envoie aucun e-mail.", "Aucune publicité, aucune revente, aucune communication commerciale. Les actualités de la plateforme sont désactivées par défaut et il n'y en a pas à ce jour."]],
  ["Cookies et stockage", ["GEONEX ne dépose aucun cookie de suivi. Votre jeton de connexion est conservé dans le stockage de votre navigateur (de façon durable si vous cochez « Rester connecté », sinon jusqu'à la fermeture du navigateur) ou dans le trousseau sécurisé de votre téléphone."]],
  ["Qui voit quoi", ["Les autres participants voient votre pseudonyme et votre avatar. Ils ne voient jamais votre adresse e-mail. Les informations privées d'une équipe (dossier, objectifs, secrets) ne sont transmises qu'à cette équipe. Les scénarios restent privés tant que vous ne les proposez pas à la bibliothèque."]],
  ["Hébergement et prestataires", ["Les données sont hébergées chez les prestataires choisis par l'exploitant (service d'hébergement et base de données PostgreSQL). Aucun fournisseur d'envoi d'e-mails n'est utilisé."]],
  ["Vos droits", ["Accès et rectification : votre espace, onglet Mon profil, permet de consulter et modifier votre pseudonyme, votre adresse et votre mot de passe.", "Effacement : Mon espace, Paramètres, « Supprimer mon compte ». Vos favoris, invitations, notifications, préférences et scénarios non utilisés sont effacés ; les parties jouées avec d'autres participants restent dans leurs archives, votre compte y apparaissant sous le nom « Compte supprimé », sans adresse e-mail.", "Pour toute autre demande, adressez-vous à l'exploitant du service."]],
  ["Durée de conservation", ["Les comptes sont conservés tant qu'ils existent. Les invitations expirent après 7 jours. Les sessions non démarrées expirent après 48 heures."]],
];

/** Politique de confidentialité. Texte de base à compléter par l'exploitant (identité, contact) et à faire relire avant exploitation publique. */
export default function Privacy() {
  return (
    <PageScreen max={900}>
      <Paper style={{ padding: S(8), gap: S(4) }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.4, color: "#7A6428", textTransform: "uppercase" }}>Politique de confidentialité</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: 38, color: C.ink }}>Vos données, en clair</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 15.5, lineHeight: 24, color: C.ink }}>GEONEX collecte le strict nécessaire pour faire vivre votre compte et vos simulations. Voici lesquelles, pourquoi, et comment les contrôler.</Text>
        {SECTIONS.map(([t, ps]) => (
          <View key={t} style={{ gap: S(2), borderTopWidth: 1, borderTopColor: "#DDD6C5", paddingTop: S(3) }}>
            <Text style={{ fontFamily: F.title, fontSize: 22, color: C.ink }}>{t}</Text>
            {ps.map((p) => <Text key={p} style={{ fontFamily: F.sans, fontSize: 15.5, lineHeight: 24, color: C.ink }}>{p}</Text>)}
          </View>
        ))}
        <Text style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 18, color: C.inkSoft }}>Mis à jour le 30 octobre 2026. Responsable du traitement : l'exploitant de GEONEX, dont l'identité et les coordonnées doivent être renseignées ici avant la mise en service publique. Ce texte n'a pas encore fait l'objet d'une relecture juridique (RGPD, mineurs).</Text>
      </Paper>
    </PageScreen>
  );
}
