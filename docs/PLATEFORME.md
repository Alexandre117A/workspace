# Plateforme GEONEX : comptes, espace personnel, bibliothèque, documentation

Mis à jour le 30 octobre 2026 (branche `v2`). Ce document décrit ce qui existe réellement, ce qui demande une configuration, et les limites.

## Ce qui est opérationnel (testé)
| Fonction | Où | Test |
|---|---|---|
| Inscription (e-mail, pseudonyme unique, mot de passe, conditions) | `/auth?mode=register` | `services/api/test/platform.test.mjs` |
| Connexion, « rester connecté 30 jours », déconnexion de tous les appareils | `/auth?mode=login` | idem |
| Vérification d'adresse (lien 48 h, usage unique) | `/verify` | idem |
| Mot de passe oublié → lien 1 h, usage unique, révocation des sessions | `/forgot`, `/reset` | idem |
| Profil : pseudonyme, avatar monogramme, changement d'adresse vérifié, mot de passe | `/space?tab=profile` | idem |
| Suppression de compte (mot de passe exigé, anonymisation, parties des autres préservées) | `/space?tab=settings` | idem |
| Espace personnel : simulations, participations, sessions en cours, favoris, invitations | `/space` | idem |
| Invitations par pseudonyme, par lien, par e-mail ; acceptation, refus, révocation | salon d'attente, `/space`, `/invite` | idem |
| Centre des scénarios : recherche, filtres combinables, tri, fiches, favoris | `/library`, `/scenario` | idem + vérification en navigateur |
| Publication modérée de scénarios, signalements, administration | `/space`, `/admin` | idem |
| Documentation (30 articles, recherche) et méthodologie | `/docs`, `/methodology` | vérification en navigateur |

## Ce qui demande une configuration de votre part
**L'envoi réel d'e-mails.** Sans fournisseur, GEONEX fonctionne mais n'envoie rien, et **le dit clairement** : après l'inscription l'écran affiche « l'envoi d'e-mails n'est pas encore activé sur ce serveur : aucun message n'a été envoyé ». Aucun e-mail n'a été envoyé pendant les tests (fournisseur de développement « log » : le message est écrit dans le journal du serveur).

Variables d'environnement du serveur (Render → Environment) :

| Variable | Rôle |
|---|---|
| `GEONEX_PUBLIC_URL` | adresse publique du service (sans `/` final), utilisée dans les liens des e-mails (ex. `https://geonex.onrender.com`) |
| `SMTP_URL` ou `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | accès au serveur d'envoi (fournisseur SMTP transactionnel) ; ne jamais les mettre dans le code |
| `GEONEX_MAIL_FROM` | expéditeur, ex. `GEONEX <no-reply@votre-domaine>` ; **doit appartenir à un domaine (ou une adresse) que vous avez validé chez le fournisseur** |
| `GEONEX_MAIL_PROVIDER` | `smtp` (déduit si SMTP configuré), `log` (développement), sinon aucun envoi |
| `GEONEX_REQUIRE_VERIFIED` | `true` pour exiger l'adresse vérifiée (à n'activer qu'une fois les e-mails opérationnels) |
| `GEONEX_MODERATION` | `on` (défaut) : un administrateur relit les scénarios proposés ; `off` : publication immédiate |
| `GEONEX_OWNER_EMAILS` | adresses des administrateurs (jamais un pseudonyme). Le rôle n'est accordé qu'à une adresse **vérifiée** quand l'envoi d'e-mails est actif |

**Délivrabilité (à faire chez votre fournisseur et votre hébergeur DNS).** Le fournisseur affiche les enregistrements à ajouter à votre domaine : SPF (TXT), DKIM (TXT ou CNAME) et, conseillé, DMARC (`v=DMARC1; p=none; rua=mailto:vous@votre-domaine` pour commencer). Sans domaine à vous, certains fournisseurs permettent de valider une adresse d'expéditeur unique, avec une délivrabilité moindre. Les offres gratuites et leurs limites changent : vérifiez-les sur le site du fournisseur. Aucune adresse d'expédition n'est prétendue opérationnelle dans ce dépôt.

**Texte légal.** `/terms` et `/privacy` sont des bases à compléter (identité et coordonnées de l'exploitant) et à faire relire juridiquement (RGPD, mineurs) avant une exploitation publique.

## Sécurité
- Mots de passe : scrypt avec sel, jamais en clair ni dans les réponses ; règles : 10 caractères au moins, une lettre, un chiffre.
- Jetons de vérification, de réinitialisation et d'invitation : 256 bits aléatoires, seule l'**empreinte SHA-256** est stockée, expiration, usage unique (marquage atomique : un double clic ne réussit qu'une fois).
- Authentification contrôlée **côté serveur à chaque requête** et à chaque connexion temps réel : signature du jeton, puis état réel du compte (existant, non supprimé, version des sessions). Réinitialiser ou changer le mot de passe, ou « déconnecter les autres appareils », révoque les anciens jetons.
- Limitation des tentatives : connexion (par IP + adresse, et par adresse), inscription, mot de passe oublié, recherche de pseudonyme, invitations, signalements, publications ; limiteur global par IP. Ces compteurs sont en mémoire (une seule instance d'API).
- Pas d'énumération par le mot de passe oublié (réponse identique) ni par la connexion (message unique). **Compromis assumé** : l'inscription indique qu'une adresse ou un pseudonyme est déjà pris, comme demandé ; le débit est limité par IP.
- Les autorisations sont vérifiées côté serveur : on ne lit ou ne modifie que ses propres sessions, scénarios, invitations ; la couche « contrôle des zones » est réservée au Président ; le catalogue et la bibliothèque ne contiennent aucun objectif, secret ou ligne rouge.
- Jeton en `Authorization: Bearer` (pas de cookie, donc pas de CSRF) conservé dans le stockage du navigateur : exposé à un XSS, d'où l'absence de HTML injecté et la validation de toutes les entrées (zod). Sans « rester connecté », le jeton disparaît à la fermeture du navigateur.

## Base de données (migration `0002_platform.sql`)
Conservatrice : aucune donnée supprimée ni réattribuée ; les pseudonymes en double de la v1 sont départagés par un suffixe avant la création de l'index d'unicité. Nouvelles colonnes de `users` (vérification, version des sessions, préférences, suppression) et de `scenarios` (visibilité, statut de publication), nouvelles tables `email_tokens`, `email_outbox`, `scenario_favorites`, `invitations`, `notifications`, `content_reports`, colonne `sessions.archived_at`. Les comptes existants restent valables, avec une adresse « non vérifiée ». Les parties existantes sont inchangées (le code de participation et la création de simulation fonctionnent comme avant).

Les articles de documentation et la page de méthodologie sont **dans le code** (`apps/client/src/content/docs.ts`) plutôt qu'en base : plus simple à relire et à versionner. Une édition par un administrateur dans l'interface n'existe pas encore.

## Statuts de session affichés
Seuls des états réels du moteur : en préparation (salon d'attente), session active, terminée, expirée, et « archivée » (masquée par l'organisateur). Il n'existe pas de « brouillon » : le scénario préparé est enregistré dans « Mes scénarios ».

## Limites connues
- Aucun e-mail réel n'a été envoyé : la chaîne SMTP est écrite mais non éprouvée avec un vrai fournisseur.
- Pas de téléversement d'avatar (monogramme coloré), pas de filtre « durée » ni « nombre de joueurs » : toutes les fiches acceptent 1 à 16 équipes et la durée se choisit au lancement, donc ces filtres ne distingueraient rien. Le filtre « complexité » repose sur une règle documentée (nombre d'acteurs).
- Pas de modération automatique de contenu : la relecture humaine est la seule protection ; les liens sont limités à deux par présentation.
- Pas de connexion Apple/Google, pas de double authentification.
- Les limiteurs de débit sont en mémoire : ils supposent une seule instance d'API.
- Non vérifié sur iPhone/iPad ; disposition ≥ 1100 px contrôlée par mesure (pas par capture).
