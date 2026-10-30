# Préparation App Store — GEONEX

**Rien n'est publié.** La publication exige votre compte Apple Developer (99 $/an), votre compte Expo et un serveur en ligne : je ne peux pas les créer ni payer à votre place. Ce document contient tout ce qui peut être préparé à l'avance.

## Fiche de l'application (à coller dans App Store Connect)
- **Nom** : GEONEX
- **Sous-titre** (30 car.) : Simulations géopolitiques
- **Catégorie** : Jeux › Stratégie (ou Éducation). **Prix** : gratuit. **Publicités** : aucune.
- **Description** : GEONEX est une cellule de crise virtuelle. Incarnez un État, une organisation ou une puissance, négociez en privé, prenez la parole devant l'assemblée, engagez vos ressources et affrontez les conséquences. Crises contemporaines, épisodes historiques ou univers imaginaires : le moteur de simulation fait évoluer un monde cohérent où l'information est imparfaite et où les acteurs non joués défendent leurs propres intérêts. Un Président de séance arbitre la partie ; des Communiqués de Rome bouleversent les équilibres. Gratuit, sans publicité.
- **Mots-clés** (100 car.) : géopolitique,simulation,diplomatie,stratégie,crise,histoire,multijoueur,débat,relations internationales
- **Âge** : à déterminer par le questionnaire Apple (contenu : conflits armés fictifs, sans violence graphique). Prévoir 12+ ou 17+ selon vos réponses.

## Mentions de confidentialité (« étiquettes » Apple) — à vérifier avec `docs/CONFIDENTIALITE.md`
- Données liées à l'utilisateur : adresse email, nom affiché, contenu des parties (décisions, messages).
- Pas de suivi publicitaire, pas de revente. Micro : utilisé uniquement pour la voix, avec texte d'usage déjà défini (`NSMicrophoneUsageDescription`).
- Suppression de compte intégrée à l'application (obligatoire pour Apple) : **déjà présente** (Compte › Supprimer mon compte).

## Notes pour l'équipe de validation Apple
Fournir un compte de démonstration (ou le mode invité), l'adresse du serveur, et expliquer qu'une partie nécessite plusieurs participants : indiquer le code de session d'une partie de test.

## Éléments à produire
Icône 1024×1024, captures d'écran (iPhone 6,9", iPad 13"), URL de politique de confidentialité publique, URL d'assistance.

## Étapes
1. Héberger l'API et le moteur en HTTPS (`docs/DEPLOIEMENT.md`).
2. Remplacer dans `apps/client/eas.json` les adresses `REMPLACER-…` par l'adresse de l'API, et l'identifiant `app.geonex.mobile` (`app.json`) par un identifiant que vous possédez.
3. `npx eas-cli login` puis `npx eas-cli build --platform ios --profile production` (compte Expo, certificats gérés par EAS avec votre compte Apple).
4. `npx eas-cli submit --platform ios` puis renseigner la fiche et soumettre à la validation.
5. Le client audio natif (iOS) exige une build avec `@livekit/react-native` : à ajouter avant la soumission si vous voulez la voix sur iPhone.
