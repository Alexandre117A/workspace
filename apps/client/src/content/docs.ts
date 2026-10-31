/**
 * Centre de documentation GEONEX. Chaque article décrit une fonctionnalité qui existe réellement dans l'application.
 * Pour en ajouter un : une entrée dans ARTICLES (catégorie, titre, introduction, étapes, texte, liens, articles associés).
 * Une fonctionnalité qui n'existe pas encore ne se documente pas ici.
 */
export interface DocCategory { id: string; title: string; blurb: string }
export interface DocArticle {
  slug: string;
  category: string;
  title: string;
  intro: string;
  steps?: string[];
  body?: string[];
  links?: { label: string; href: string }[];
  related?: string[];
  updated: string;
  published: boolean;
}

export const CATEGORIES: DocCategory[] = [
  { id: "premiers-pas", title: "Premiers pas", blurb: "Créer un compte, rejoindre une session, comprendre les trois modes." },
  { id: "participer", title: "Participer à une simulation", blurb: "Votre rôle, l'atlas, les décisions et leurs conséquences." },
  { id: "creer", title: "Créer une simulation", blurb: "Du scénario au code de participation." },
  { id: "atlas", title: "Atlas stratégique", blurb: "Lire la carte, les indicateurs et les rapports de force." },
  { id: "compte", title: "Compte et sécurité", blurb: "Profil, mot de passe, invitations, confidentialité." },
  { id: "aide", title: "Aide et problèmes techniques", blurb: "Quand quelque chose ne fonctionne pas." },
];

const U = "2026-10-30";
export const ARTICLES: DocArticle[] = [
  // ---------------------------------------------------------------- premiers pas
  { slug: "quest-ce-que-geonex", category: "premiers-pas", title: "Qu'est-ce que GEONEX ?", published: true, updated: U,
    intro: "GEONEX est une plateforme gratuite de simulation géopolitique multijoueur : chaque équipe incarne un acteur, négocie, décide, et le monde simulé réagit.",
    body: ["Une partie réunit un Président de séance (qui organise, arbitre et contrôle le temps) et plusieurs équipes. Le moteur de simulation applique des règles explicites : capitaux, relations entre acteurs, escalade, défense collective, situation intérieure. Les acteurs non joués décident selon leur doctrine.",
      "GEONEX est un outil d'exploration, pas une prédiction. Voir « Méthodologie & fiabilité » pour la distinction entre faits, estimations, hypothèses et événements simulés."],
    links: [{ label: "Méthodologie & fiabilité", href: "/methodology" }, { label: "Centre des scénarios", href: "/library" }], related: ["comprendre-les-trois-modes", "creer-un-compte"] },
  { slug: "creer-un-compte", category: "premiers-pas", title: "Comment créer un compte ?", published: true, updated: U,
    intro: "L'inscription est gratuite et demande une adresse e-mail, un pseudonyme et un mot de passe.",
    steps: ["Cliquez sur « S'inscrire » dans la navigation.", "Saisissez une adresse e-mail valide, un pseudonyme (3 à 24 caractères : lettres, chiffres, point, tiret, tiret bas) et un mot de passe d'au moins 10 caractères avec une lettre et un chiffre.", "Confirmez le mot de passe et acceptez les conditions d'utilisation.", "Validez : votre compte est créé et utilisable aussitôt, sans confirmation ni e-mail."],
    body: ["Le pseudonyme est unique et public : il apparaît dans les simulations multijoueurs. Votre mot de passe n'est jamais conservé en clair. GEONEX n'envoie aucun e-mail : notez votre mot de passe, il ne peut pas être récupéré par e-mail."],
    links: [{ label: "Créer mon compte", href: "/auth?mode=register" }], related: ["se-connecter", "recuperer-son-compte", "profil"] },
  { slug: "se-connecter", category: "premiers-pas", title: "Comment se connecter ?", published: true, updated: U,
    intro: "Connectez-vous avec votre adresse e-mail et votre mot de passe.",
    steps: ["Cliquez sur « Se connecter ».", "Saisissez votre adresse e-mail et votre mot de passe.", "Cochez « Rester connecté 30 jours » sur un appareil personnel ; sinon la session se ferme avec le navigateur.", "Après connexion vous retrouvez votre espace, ou l'action que vous aviez demandée avant de vous connecter."],
    body: ["Après plusieurs tentatives échouées, la connexion est temporairement bloquée par précaution. Si vous avez oublié votre mot de passe, voir « Mot de passe oublié »."],
    links: [{ label: "Se connecter", href: "/auth?mode=login" }], related: ["recuperer-son-compte"] },
  { slug: "rejoindre-une-simulation", category: "premiers-pas", title: "Comment rejoindre une simulation ?", published: true, updated: U,
    intro: "Trois façons : le code de participation, une invitation reçue dans votre espace, ou un lien d'invitation.",
    steps: ["Avec un code : saisissez les 10 caractères (format XXXXX-XXXXX) dans « Rejoindre une session » sur l'accueil.", "Avec une invitation : ouvrez Mon espace, onglet Invitations, puis « Accepter ».", "Avec un lien : ouvrez-le, connectez-vous ou créez un compte, puis « Rejoindre la simulation »."],
    body: ["On ne peut rejoindre une session que pendant l'attente des participants, tant que le nombre d'équipes prévu n'est pas atteint. Une session commencée n'accepte plus que ses participants."],
    related: ["code-de-participation", "gerer-ses-invitations"] },
  { slug: "code-de-participation", category: "premiers-pas", title: "Comment fonctionne un code de participation ?", published: true, updated: U,
    intro: "Le code est un identifiant de 10 caractères, transmis par l'organisateur, qui ouvre l'accès à une session précise.",
    body: ["Il est affiché à l'organisateur dans le salon d'attente et dans Mon espace tant que la session attend ses participants. Les caractères ambigus (0, O, 1, I, L) sont exclus. Le nombre d'essais est limité : une série de codes faux bloque temporairement les tentatives.",
      "Le code ne remplace pas les invitations : les deux méthodes se complètent et suivent les mêmes règles d'admission."],
    related: ["rejoindre-une-simulation", "partager-un-code"] },
  { slug: "comprendre-les-trois-modes", category: "premiers-pas", title: "Comprendre les trois modes", published: true, updated: U,
    intro: "Simulation contemporaine, simulation historique, création d'un univers : trois façons de lancer une partie.",
    body: ["Mode I — contemporain : vous décrivez une situation (par exemple « Crise Chine–Taïwan ») ; le moteur identifie les États cités et construit la situation à partir de ses données de référence, signalées comme estimations.",
      "Mode II — historique : des bases détaillées sont disponibles pour la crise des missiles de Cuba (1962), la campagne d'Égypte (1799) et la guerre de Cent Ans (1415). Aucun acteur ne connaît les événements postérieurs à la date de départ : l'histoire peut diverger.",
      "Mode III — créer une simulation : vous décrivez un monde (nations, empires, planètes) ; le moteur génère les acteurs et une carte schématique, signalée comme telle."],
    links: [{ label: "Centre des scénarios", href: "/library" }], related: ["creer-un-scenario", "premiere-simulation"] },
  { slug: "premiere-simulation", category: "premiers-pas", title: "Comment commencer sa première simulation ?", published: true, updated: U,
    intro: "Le plus simple : choisir une fiche du Centre des scénarios et lancer une session avec quelques amis.",
    steps: ["Ouvrez le Centre des scénarios et choisissez une fiche, par exemple « Crise des missiles de Cuba ».", "Cliquez sur « Commencer une simulation » (créez un compte si on vous le demande).", "Choisissez le nombre d'équipes et la durée (30 minutes au minimum, une heure recommandée), puis lancez la préparation.", "Partagez le code de participation ou invitez des joueurs depuis le salon d'attente.", "Quand toutes les équipes sont arrivées, le Président lance la partie."],
    links: [{ label: "Centre des scénarios", href: "/library" }], related: ["demarrer-une-session", "comprendre-son-role"] },

  // ---------------------------------------------------------------- participer
  { slug: "comprendre-son-role", category: "participer", title: "Comprendre son rôle", published: true, updated: U,
    intro: "À l'ouverture de la partie, chaque équipe reçoit un dossier confidentiel qu'elle est seule à connaître.",
    body: ["Le dossier présente votre acteur, ses capitaux (politique, économique, militaire), ses ressources, ses objectifs et ses lignes rouges. Les objectifs sont de quatre sortes : principal, secondaire, de coalition et secret. Seul votre dossier vous est montré : ni les objectifs ni les secrets des autres équipes ne vous sont transmis.",
      "Le bouton « Dossier » du poste de commandement le rouvre à tout moment."],
    related: ["informations-du-scenario", "prendre-une-decision"] },
  { slug: "informations-du-scenario", category: "participer", title: "Consulter les informations du scénario", published: true, updated: U,
    intro: "Le dossier de situation rassemble le contexte public du scénario.",
    body: ["Le bouton « Situation » ouvre le dossier : date et lieu de départ, camps, acteurs connus, zones de crise et, selon les scénarios, des notes de contexte. Pour un scénario historique, les informations s'arrêtent à la date de départ.",
      "Le bandeau stratégique en haut de l'écran rappelle le scénario, l'époque, la date simulée, le tour, la phase et votre rôle."],
    related: ["utiliser-latlas", "comprendre-les-acteurs"] },
  { slug: "utiliser-latlas", category: "participer", title: "Utiliser l'atlas stratégique", published: true, updated: U,
    intro: "L'atlas est la carte interactive de votre simulation, adaptée à l'époque et à la région.",
    steps: ["Déplacez la carte en la faisant glisser ; zoomez avec les boutons + et − (ou Ctrl + molette sur ordinateur).", "Activez ou masquez les couches avec les boutons en haut à gauche.", "Touchez un acteur, une zone ou un événement pour en lire le détail.", "Le bouton « Vue » bascule entre le théâtre de la crise et l'ensemble des acteurs."],
    links: [{ label: "Comprendre la carte", href: "/docs/comprendre-la-carte" }], related: ["comprendre-la-carte", "lire-les-indicateurs"] },
  { slug: "comprendre-les-acteurs", category: "participer", title: "Comprendre les acteurs", published: true, updated: U,
    intro: "Les acteurs sont des États, des organisations ou des factions, joués par des équipes ou par le moteur.",
    body: ["Chaque acteur appartient à un camp et possède un dirigeant (dont le statut — confirmé, estimation, hypothèse — est précisé). Les acteurs non joués ont une doctrine (dissuasion, opportunisme, équilibrage, médiation, prudence) qui oriente leurs choix.",
      "La synthèse stratégique liste les acteurs principaux ; un clic sur l'un d'eux le localise sur la carte."],
    related: ["utiliser-latlas", "participer-en-multijoueur"] },
  { slug: "prendre-une-decision", category: "participer", title: "Prendre une décision", published: true, updated: U,
    intro: "Pendant la phase de décisions, chaque équipe peut engager jusqu'à trois décisions par round.",
    steps: ["Ouvrez la phase « Décisions » et choisissez une catégorie (initiative diplomatique, alliance, sanctions, déploiement militaire, opération clandestine, aide économique…).", "Désignez la cible et la zone si nécessaire, puis répartissez vos capitaux (au plus 30 par décision) et vos ressources.", "Décrivez votre intention par écrit : les participants écrivent leurs décisions, la voix n'est pas utilisée.", "Validez : le moteur évalue la décision ; certaines décisions (frappe, opération clandestine) passent par l'arbitrage du Président."],
    body: ["Chaque décision a un coût réel en capitaux et peut faire monter l'escalade avec un autre acteur. Les résultats ne sont tirés qu'à la résolution du round."],
    related: ["consulter-les-consequences", "progression-dune-session"] },
  { slug: "consulter-les-consequences", category: "participer", title: "Consulter les conséquences des événements", published: true, updated: U,
    intro: "À la fin de chaque round, le moteur confronte toutes les décisions et publie un rapport.",
    body: ["Le rapport du round résume ce qui s'est passé, les effets sur vos capitaux et sur la situation intérieure. Les événements importants sont localisés sur l'atlas, et la chronologie conserve le titre de chaque round.",
      "Des Communiqués de Rome — événements de portée générale — peuvent interrompre la séance : ils s'affichent en plein écran et tous les chronomètres sont suspendus le temps de les lire."],
    related: ["lire-les-indicateurs", "evolution-du-scenario"] },
  { slug: "progression-dune-session", category: "participer", title: "Comprendre la progression d'une session", published: true, updated: U,
    intro: "Une session se déroule en rounds, chacun découpé en phases chronométrées par le serveur.",
    body: ["Les phases d'un round : briefing, assemblée publique, diplomatie, décisions, arbitrage, résolution du moteur, conséquences. Le chronomètre est celui du serveur : il est identique pour tous et reprend après une reconnexion ou une pause du Président.",
      "Le nombre de rounds dépend de la durée choisie et du nombre d'équipes. Le dernier round est annoncé à l'écran. En cas de redémarrage du serveur, la partie reprend à partir de son dernier état enregistré."],
    related: ["prendre-une-decision", "simulation-ne-charge-pas"] },
  { slug: "participer-en-multijoueur", category: "participer", title: "Participer à une simulation multijoueur", published: true, updated: U,
    intro: "L'assemblée publique, la diplomatie privée et les décisions secrètes structurent le jeu à plusieurs.",
    body: ["Assemblée : chaque équipe s'exprime à son tour, les autres réagissent brièvement. Diplomatie : échanges écrits privés et appels entre deux équipes. Les cartes stratégiques (renseignement, guerre de l'information, nouveau front, choc politique) deviennent disponibles à partir du round 2, une seule fois chacune.",
      "Le Président de séance arbitre les demandes incertaines, peut suspendre la séance et peut proposer un Communiqué de Rome."],
    related: ["comprendre-les-acteurs", "gerer-les-parametres"] },

  // ---------------------------------------------------------------- créer
  { slug: "creer-un-scenario", category: "creer", title: "Créer un scénario", published: true, updated: U,
    intro: "Un scénario est le cadre de départ ; une simulation (ou session) est une partie jouée à partir de lui.",
    steps: ["Choisissez un mode : contemporain, historique ou personnalisé.", "Décrivez la situation en quelques phrases. Pour le mode personnalisé, répondez ensuite aux deux à cinq questions du moteur, qui tiennent compte de tout ce que vous avez écrit.", "Le moteur prépare le scénario (acteurs, relations, zones, objectifs) et vous montre sa progression réelle.", "Le scénario est enregistré dans votre espace, privé par défaut."],
    body: ["Vous pouvez ensuite lancer plusieurs sessions à partir du même scénario, ou le proposer à la bibliothèque publique."],
    related: ["definir-une-periode", "publier-un-scenario"] },
  { slug: "definir-une-periode", category: "creer", title: "Définir une période", published: true, updated: U,
    intro: "L'époque détermine le style de la carte et ce que les acteurs peuvent connaître.",
    body: ["En mode contemporain, la période est le présent. En mode historique, nommez l'événement et l'année (« Crise des missiles de Cuba, octobre 1962 ») : seules les bases intégrées sont disponibles aujourd'hui. En mode personnalisé, l'époque (médiévale, moderne, contemporaine, spatiale…) est déduite de votre description et influe sur la carte et l'ambiance."],
    related: ["creer-un-scenario", "comprendre-la-carte"] },
  { slug: "definir-les-acteurs", category: "creer", title: "Définir les acteurs", published: true, updated: U,
    intro: "Citez les États ou entités qui comptent : le moteur construit les autres.",
    body: ["En mode contemporain, nommez au moins un pays ; le moteur ajoute les grandes puissances et acteurs pertinents. En mode personnalisé, citez les nations, empires ou organisations de votre univers ; le moteur complète avec des acteurs générés et signalés comme fictifs.",
      "Les capitaux (politique, économique, militaire) et les ressources sont calculés par le moteur : ce sont des estimations ou des unités de jeu, signalées comme telles, jamais des données saisies à la main."],
    related: ["rediger-un-contexte", "definir-des-objectifs"] },
  { slug: "rediger-un-contexte", category: "creer", title: "Rédiger un contexte géopolitique", published: true, updated: U,
    intro: "Un bon contexte indique qui s'oppose à qui, où, et pourquoi la situation est tendue.",
    body: ["Quelques phrases suffisent : lieux, acteurs, enjeux (territoire, ressources, alliances), moment précis. Plus la description est concrète, plus le scénario généré est fidèle. Évitez d'y inclure l'issue : en mode historique, les acteurs ne la connaissent pas."],
    related: ["creer-un-scenario", "definir-les-acteurs"] },
  { slug: "definir-des-objectifs", category: "creer", title: "Définir des objectifs", published: true, updated: U,
    intro: "Les objectifs de chaque équipe sont proposés par le moteur à partir du scénario.",
    body: ["Chaque acteur reçoit un objectif principal, des objectifs secondaires, un objectif de coalition et parfois un objectif secret, ainsi que des lignes rouges. Ils ne sont pas saisis à la main aujourd'hui : ils découlent des acteurs, des zones et des relations du scénario. Le classement final tient compte de leur accomplissement."],
    related: ["comprendre-son-role", "definir-les-acteurs"] },
  { slug: "organiser-les-participants", category: "creer", title: "Organiser les participants", published: true, updated: U,
    intro: "Vous choisissez le nombre d'équipes (1 à 16) et la durée avant de lancer la préparation.",
    body: ["Vous devenez Président de séance : vous n'incarnez aucun acteur, vous arbitrez, organisez et contrôlez le temps. Les équipes se voient attribuer leurs rôles au lancement. Le moteur adapte les phases à la durée et au nombre d'équipes (30 minutes au minimum, une heure recommandée)."],
    related: ["demarrer-une-session", "partager-un-code"] },
  { slug: "demarrer-une-session", category: "creer", title: "Démarrer une session", published: true, updated: U,
    intro: "Le salon d'attente réunit les participants ; le Président lance la partie quand tout le monde est là.",
    steps: ["Après la préparation, vous arrivez dans le salon d'attente avec le code de participation.", "Invitez des joueurs (code, pseudonyme ou lien).", "Quand le nombre d'équipes prévu est atteint, cliquez sur « Lancer la partie ».", "Chaque équipe reçoit son dossier confidentiel, puis le briefing du premier round commence."],
    related: ["partager-un-code", "gerer-ses-invitations"] },
  { slug: "partager-un-code", category: "creer", title: "Partager un code de participation", published: true, updated: U,
    intro: "Copiez le code depuis le salon d'attente ou depuis Mon espace, et transmettez-le aux joueurs.",
    body: ["Le bouton « Copier » met le code dans le presse-papiers ; « Partager » ouvre le partage de votre appareil. Le code n'apparaît dans aucun catalogue public. Vous pouvez aussi générer un lien d'invitation ou inviter un joueur par son pseudonyme exact."],
    links: [{ label: "Mon espace", href: "/space?tab=simulations" }], related: ["code-de-participation", "gerer-ses-invitations"] },
  { slug: "gerer-les-parametres", category: "creer", title: "Gérer les paramètres de la simulation", published: true, updated: U,
    intro: "L'organisateur dispose de contrôles de séance et d'archivage.",
    body: ["Pendant la partie : suspendre et reprendre la séance, arbitrer les demandes, transférer la présidence, déléguer temporairement une équipe absente au moteur. Après la partie : consulter le rapport et les archives. Dans Mon espace : archiver une session (elle est masquée sans rien perdre), supprimer une session qui n'a pas commencé."],
    related: ["partager-un-code", "organiser-les-participants"] },
  { slug: "publier-un-scenario", category: "creer", title: "Proposer un scénario à la bibliothèque", published: true, updated: U,
    intro: "Un scénario reste privé tant que vous ne le proposez pas, et ne devient public qu'après relecture.",
    steps: ["Dans Mon espace, onglet Mes simulations, repérez le scénario dans « Mes scénarios ».", "Cliquez sur « Proposer à la bibliothèque » et renseignez un titre, une description claire et des mots-clés.", "La proposition passe « en attente de validation » ; un administrateur la relit.", "Une fois acceptée, elle apparaît dans le Centre des scénarios comme « proposée par la communauté »."],
    body: ["GEONEX ne valide pas historiquement les scénarios communautaires. Vous pouvez retirer votre scénario de la bibliothèque à tout moment ; les membres peuvent signaler un contenu problématique."],
    related: ["creer-un-scenario"] },

  // ---------------------------------------------------------------- atlas
  { slug: "comprendre-la-carte", category: "atlas", title: "Comprendre la carte", published: true, updated: U,
    intro: "Le fond de carte dépend de l'époque et ne présente jamais des frontières actuelles comme historiques.",
    body: ["Monde contemporain et guerre froide : frontières actuelles (avec un avertissement quand elles diffèrent de l'époque). Avant la guerre froide : côtes seules, avec la mention « les frontières de l'époque ne sont pas représentées ». Monde inventé : carte schématique. Le style (papier ivoire pour les époques anciennes, bleu nuit pour le contemporain) suit l'époque.",
      "Les graduations de latitude et de longitude et l'échelle aident à se repérer."],
    related: ["utiliser-latlas", "evolution-du-scenario"] },
  { slug: "couches-et-zoom", category: "atlas", title: "Utiliser le zoom et les couches disponibles", published: true, updated: U,
    intro: "Seules les couches pour lesquelles le scénario a des données apparaissent.",
    body: ["Frontières, Acteurs, Tensions (zones de crise colorées selon leur niveau), Relations (guerres, escalades et alliances que vous connaissez), Événements (deux derniers rounds) et Méridiens. La couche Contrôle, qui montre la part de contrôle de chaque acteur sur les zones, est réservée au Président."],
    related: ["comprendre-la-carte", "utiliser-latlas"] },
  { slug: "lire-les-indicateurs", category: "atlas", title: "Lire les indicateurs", published: true, updated: U,
    intro: "Chaque valeur indique sa nature : attestée, estimation, hypothèse, fictive ou issue de la simulation.",
    body: ["Vos capitaux, votre stabilité, cohésion, approbation, disponibilité des forces et lassitude de guerre sont des valeurs de simulation : elles évoluent avec les décisions. Au départ, ce sont des estimations ou des hypothèses du scénario. La flèche ▲ ▼ montre l'évolution depuis le round précédent. Une donnée absente est signalée comme indisponible : GEONEX n'affiche jamais un chiffre inventé."],
    links: [{ label: "Méthodologie & fiabilité", href: "/methodology" }], related: ["interpreter-les-rapports-de-force"] },
  { slug: "interpreter-les-rapports-de-force", category: "atlas", title: "Interpréter les rapports de force", published: true, updated: U,
    intro: "Le rapport de force est révélé aux équipes à partir du round 3 ; le Président le voit en continu.",
    body: ["Il se lit comme la répartition de puissance entre camps (barre proportionnelle) et, pour le Président, comme une courbe par round. La puissance d'un acteur combine ses capitaux, sa disponibilité et son implication dans le théâtre. Ce n'est pas une prédiction du résultat."],
    related: ["lire-les-indicateurs", "evolution-du-scenario"] },
  { slug: "informations-des-acteurs", category: "atlas", title: "Consulter les informations des acteurs", published: true, updated: U,
    intro: "Un clic sur un acteur de la carte ou de la synthèse affiche sa fiche publique.",
    body: ["Vous y trouvez son nom, son camp, son dirigeant et le statut de cette information, et une description. Les informations privées d'un acteur (objectifs, secrets, capitaux détaillés) ne sont jamais montrées aux autres équipes."],
    related: ["comprendre-les-acteurs", "utiliser-latlas"] },
  { slug: "evolution-du-scenario", category: "atlas", title: "Comprendre l'évolution du scénario", published: true, updated: U,
    intro: "La carte et les panneaux reflètent l'état validé par le moteur, jamais une impression.",
    body: ["Quand un événement change l'état de la partie (une escalade, une zone dont la tension monte, une alliance), l'atlas se met à jour à la nouvelle vue. La chronologie liste les rounds résolus ; cliquez sur l'un d'eux pour relire son récit."],
    related: ["consulter-les-consequences", "lire-les-indicateurs"] },

  // ---------------------------------------------------------------- compte
  { slug: "profil", category: "compte", title: "Modifier son profil", published: true, updated: U,
    intro: "Votre pseudonyme et votre avatar se changent dans Mon espace, onglet Mon profil.",
    body: ["Le pseudonyme doit rester unique. L'avatar est un monogramme coloré : aucune photo n'est demandée."],
    links: [{ label: "Mon profil", href: "/space?tab=profile" }], related: ["changer-son-mot-de-passe", "modifier-son-e-mail"] },
  { slug: "changer-son-mot-de-passe", category: "compte", title: "Changer son mot de passe", published: true, updated: U,
    intro: "Saisissez l'ancien mot de passe, puis le nouveau deux fois.",
    body: ["Le nouveau mot de passe doit avoir au moins 10 caractères, avec une lettre et un chiffre. Vos autres appareils sont alors déconnectés par précaution."],
    links: [{ label: "Mon profil", href: "/space?tab=profile" }], related: ["recuperer-son-compte"] },
  { slug: "recuperer-son-compte", category: "compte", title: "Mot de passe oublié", published: true, updated: U,
    intro: "GEONEX n'envoie aucun e-mail : il n'existe donc pas de lien de réinitialisation.",
    steps: ["Tant que vous êtes connecté sur un appareil, ouvrez Mon espace, onglet Mon profil, et changez votre mot de passe (l'ancien est demandé).", "Si vous êtes déconnecté et que vous avez perdu le mot de passe, le compte ne peut pas être récupéré automatiquement : contactez l'administrateur de votre plateforme, ou créez un nouveau compte avec un autre pseudonyme.", "Pour éviter la perte, utilisez un gestionnaire de mots de passe et cochez « Rester connecté 30 jours » sur un appareil personnel."],
    body: ["GEONEX ne conserve jamais votre mot de passe en clair et ne peut donc pas vous le redonner."],
    links: [{ label: "Mon profil", href: "/space?tab=profile" }], related: ["changer-son-mot-de-passe", "modifier-son-e-mail"] },
  { slug: "modifier-son-e-mail", category: "compte", title: "Modifier son adresse e-mail", published: true, updated: U,
    intro: "L'adresse sert uniquement à vous connecter ; le changement est immédiat et aucun e-mail n'est envoyé.",
    body: ["Dans Mon profil, saisissez la nouvelle adresse et votre mot de passe. Elle doit être différente de celles déjà utilisées sur GEONEX."],
    links: [{ label: "Mon profil", href: "/space?tab=profile" }], related: ["recuperer-son-compte"] },
  { slug: "gerer-ses-invitations", category: "compte", title: "Gérer les invitations", published: true, updated: U,
    intro: "Recevoir, accepter ou refuser une invitation ; en envoyer et les révoquer si vous organisez.",
    body: ["Vos invitations reçues sont dans Mon espace, onglet Invitations : acceptez pour rejoindre la session, ou refusez. Si vous organisez une session en attente, le bouton « Inviter » permet d'inviter par pseudonyme exact ou par lien, de suivre l'état de chaque invitation et de révoquer celles qui sont encore en attente. Les invitations expirent après 7 jours."],
    links: [{ label: "Mes invitations", href: "/space?tab=invitations" }], related: ["rejoindre-une-simulation", "partager-un-code"] },
  { slug: "confidentialite", category: "compte", title: "Comprendre les paramètres de confidentialité", published: true, updated: U,
    intro: "Vous décidez si l'on peut vous inviter par votre pseudonyme et quelles notifications vous recevez.",
    body: ["Dans Paramètres : activer ou non les notifications d'invitation, accepter ou non d'être trouvé par pseudonyme. GEONEX n'envoie aucun e-mail : ni message de sécurité, ni newsletter, ni message commercial."],
    links: [{ label: "Politique de confidentialité", href: "/privacy" }, { label: "Paramètres", href: "/space?tab=settings" }], related: ["supprimer-son-compte"] },
  { slug: "supprimer-son-compte", category: "compte", title: "Supprimer son compte", published: true, updated: U,
    intro: "La suppression est définitive et demande votre mot de passe.",
    body: ["Vos favoris, invitations, notifications et préférences sont effacés, ainsi que les scénarios que vous n'avez jamais utilisés. Les parties jouées avec d'autres participants restent dans leurs archives sous le nom « Compte supprimé ». La suppression est refusée tant que vous organisez une session en cours, pour ne pas interrompre les autres joueurs."],
    links: [{ label: "Paramètres", href: "/space?tab=settings" }], related: ["confidentialite"] },

  // ---------------------------------------------------------------- aide
  { slug: "simulation-ne-charge-pas", category: "aide", title: "Que faire si une simulation ne charge pas ?", published: true, updated: U,
    intro: "L'état de la partie est conservé par le serveur : recharger suffit presque toujours.",
    steps: ["Rechargez la page. Après une mise à jour de GEONEX, un message indique qu'une nouvelle version est installée et la page se recharge seule.", "Vérifiez votre connexion : un voyant rouge dans la barre du haut signale une reconnexion en cours.", "Le service gratuit peut s'endormir après quelques minutes d'inactivité : le premier chargement peut durer environ une minute.", "Si l'écran affiche « Incident d'affichage », utilisez « Réessayer ». La session reprend là où elle en était."],
    related: ["progression-dune-session", "signaler-un-dysfonctionnement"] },
  { slug: "code-ne-fonctionne-pas", category: "aide", title: "Que faire si un code de participation ne fonctionne pas ?", published: true, updated: U,
    intro: "Vérifiez le code, l'état de la session et le nombre de places.",
    steps: ["Le code comporte 10 caractères (XXXXX-XXXXX), sans espace ni caractère ambigu.", "La session doit encore attendre ses participants : une partie commencée n'accepte que ses participants.", "La session ne doit pas être complète ni expirée.", "Après plusieurs essais faux, patientez quelques minutes.", "Demandez à l'organisateur de vous inviter par pseudonyme ou par lien."],
    related: ["code-de-participation", "gerer-ses-invitations"] },
  { slug: "signaler-un-dysfonctionnement", category: "aide", title: "Comment signaler un dysfonctionnement ?", published: true, updated: U,
    intro: "Décrivez précisément ce qui s'est passé : cela permet de le corriger.",
    body: ["Notez la page, l'heure, ce que vous attendiez et ce qui s'est produit, ainsi que le navigateur ou l'appareil utilisé, et transmettez-le à l'administrateur de votre plateforme. Pour un scénario communautaire problématique, utilisez « Signaler ce scénario » sur sa fiche."],
    related: ["contacter-lassistance"] },
  { slug: "contacter-lassistance", category: "aide", title: "Comment contacter l'assistance ?", published: true, updated: U,
    intro: "GEONEX n'a pas encore de service d'assistance dédié.",
    body: ["Pour le moment, adressez-vous à l'organisateur de votre session pour les questions de partie, et à l'administrateur de la plateforme pour les questions de compte. Un contact officiel sera ajouté à cette page lorsqu'il existera."],
    related: ["signaler-un-dysfonctionnement"] },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Recherche simple et fiable : chaque mot saisi doit figurer dans l'article ; le titre pèse plus que le texte. */
export function searchDocs(query: string, category?: string | null): DocArticle[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const pool = ARTICLES.filter((a) => a.published && (!category || a.category === category));
  if (!words.length) return pool;
  return pool
    .map((a) => {
      const title = norm(a.title), rest = norm([a.intro, ...(a.steps ?? []), ...(a.body ?? [])].join(" "));
      if (!words.every((w) => title.includes(w) || rest.includes(w) || norm(CATEGORIES.find((c) => c.id === a.category)?.title ?? "").includes(w))) return null;
      return { a, score: words.reduce((s, w) => s + (title.includes(w) ? 5 : 0) + (rest.includes(w) ? 1 : 0), 0) };
    })
    .filter(Boolean)
    .sort((x, y) => y!.score - x!.score)
    .map((x) => x!.a);
}
