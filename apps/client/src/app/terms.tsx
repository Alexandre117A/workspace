import { Text, View } from "react-native";
import { PageScreen, Paper } from "../components/Page";
import { C, F, S } from "../theme";

const SECTIONS: [string, string[]][] = [
  ["Le service", ["GEONEX est une plateforme gratuite de simulation géopolitique. Elle ne comporte ni abonnement, ni paiement, ni publicité.", "Le service est fourni tel quel, sur une infrastructure d'hébergement gratuite : il peut être interrompu, ralenti ou remis à zéro sans préavis. Aucune disponibilité n'est garantie."]],
  ["Votre compte", ["Vous vous inscrivez avec une adresse e-mail dont vous êtes titulaire, un pseudonyme et un mot de passe. Vous êtes responsable de la confidentialité de votre mot de passe.", "Le pseudonyme est public dans les simulations : il ne doit pas usurper l'identité d'un tiers ni être injurieux. L'exploitant peut modifier ou suspendre un pseudonyme ou un compte manifestement abusif."]],
  ["Votre comportement", ["Les simulations sont des exercices fictifs d'exploration. Les propos haineux, discriminatoires, menaçants ou illégaux sont interdits, dans les messages entre participants comme dans les scénarios.", "Vous ne devez pas chercher à perturber le service ni à accéder aux données d'autres utilisateurs."]],
  ["Scénarios publics", ["Un scénario que vous créez est privé par défaut. Si vous le proposez à la bibliothèque, vous garantissez avoir le droit de le diffuser et qu'il respecte ces règles. Il est relu avant publication, et peut être retiré ou refusé.", "GEONEX ne valide pas historiquement les scénarios de la communauté."]],
  ["Contenus du service", ["Les cartes, textes et images de GEONEX sont soumis à leurs licences respectives, détaillées dans la page « Crédits des images ». Le code et le contenu éditorial de la plateforme appartiennent à son exploitant."]],
  ["Fin du compte", ["Vous pouvez supprimer votre compte à tout moment depuis Mon espace, Paramètres. Les conséquences sur vos données sont décrites dans la politique de confidentialité."]],
];

/** Conditions d'utilisation. Texte de base à faire relire juridiquement avant une exploitation publique à grande échelle. */
export default function Terms() {
  return (
    <PageScreen max={900}>
      <Paper style={{ padding: S(8), gap: S(4) }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.4, color: "#7A6428", textTransform: "uppercase" }}>Conditions d'utilisation</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: 38, color: C.ink }}>Règles du jeu et du service</Text>
        {SECTIONS.map(([t, ps]) => (
          <View key={t} style={{ gap: S(2), borderTopWidth: 1, borderTopColor: "#DDD6C5", paddingTop: S(3) }}>
            <Text style={{ fontFamily: F.title, fontSize: 22, color: C.ink }}>{t}</Text>
            {ps.map((p) => <Text key={p} style={{ fontFamily: F.sans, fontSize: 15.5, lineHeight: 24, color: C.ink }}>{p}</Text>)}
          </View>
        ))}
        <Text style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 18, color: C.inkSoft }}>Mis à jour le 30 octobre 2026. Ce texte n'a pas encore fait l'objet d'une relecture juridique : l'exploitant du service doit la faire avant toute exploitation publique et y indiquer ses coordonnées.</Text>
      </Paper>
    </PageScreen>
  );
}
