# Plateforme GEONEX : comptes, espace personnel, bibliothèque, documentation

Mis à jour le 31 octobre 2026 (branche `v2`). Ce document décrit ce qui existe réellement, ce qui demande une configuration, et les limites.

## Ce qui est opérationnel (testé)
| Fonction | Où | Test |
|---|---|---|
| Inscription (e-mail, pseudonyme unique, mot de passe, conditions) | `/auth?mode=register` | `services/api/test/platform.test.mjs` |
| Connexion, « rester connecté 30 jours », déconnexion de tous les appareils | `/auth?mode=login` | idem |
| Profil : pseudonyme, avatar monogramme, changement d'adresse de connexion, mot de passe | `/space?tab=profile` | idem |
| Suppression de compte (mot de passe exigé, anonymisation, parties des autres préservées) | `/space?tab=settings` | idem |
| Espace personnel : simulations, participations, sessions en cours, favoris, invitations | `/space` | idem |
| Invitations par pseudonyme et par lien ; acceptation, refus, révocation | salon d'attente, `/space`, `/invite` | idem |
| Centre des scénarios : recherche, filtres combinables, tri, fiches, favoris | `/library`, `/scenario` | idem + vérification en navigateur |
| Publication modérée de scénarios, signalements, administration | `/space`, `/admin` | idem |
| Documentation (29 articles, recherche) et méthodologie | `/docs`, `/methodology` | vérification en navigateur |

## Aucun e-mail
GEONEX n'envoie **aucun e-mail** (décision du 31 octobre 2026) : pas de message de bienvenue, pas de vérification d'adresse, pas de lien de réinitialisation, pas d'invitation par e-mail. L'adresse e-mail n'est qu'un identifiant de connexion. Conséquence assumée : **un mot de passe perdu ne se récupère pas** (il se change seulement depuis un appareil connecté) ; l'interface le dit.

## Réglages du serveur (Render → Environment)
| Variable | Rôle |
|---|---|
| `GEONEX_PUBLIC_URL` | adresse publique du service (sans `/` final), utilisée dans les liens d'invitation (ex. `https://geonex.onrender.com`) |
| `GEONEX_MODERATION` | `on` (défaut) : un administrateur relit les scénarios proposés ; `off` : publication immédiate |
| `GEONEX_OWNER_EMAILS` | adresses des administrateurs (jamais un pseudonyme) ; le rôle est accordé à l'inscription ou à la connexion avec cette adresse |

**Texte légal.** `/terms` et `/privacy` sont des bases à compléter (identité et coordonnées de l'exploitant) et à faire relire juridiquement (RGPD, mineurs) avant une exploitation publique.

## Sécurité
- Mots de passe : scrypt avec sel, jamais en clair ni dans les réponses ; règles : 10 caractères au moins, une lettre, un chiffre.
- Jetons d'invitation par lien : 256 bits aléatoires, seule l'**empreinte SHA-256** est stockée, expiration, usage unique (marquage atomique : un double clic ne réussit qu'une fois).
- Authentification contrôlée **côté serveur à chaque requête** et à chaque connexion temps réel : signature du jeton, puis état réel du compte (existant, non supprimé, version des sessions). Changer le mot de passe ou « déconnecter les autres appareils », révoque les anciens jetons.
- Limitation des tentatives : connexion (par IP + adresse, et par adresse), inscription, recherche de pseudonyme, invitations, signalements, publications ; limiteur global par IP. Ces compteurs sont en mémoire (une seule instance d'API).
- Pas d'énumération par la connexion (message unique). **Compromis assumé** : l'inscription indique qu'une adresse ou un pseudonyme est déjà pris, comme demandé ; le débit est limité par IP.
- Les autorisations sont vérifiées côté serveur : on ne lit ou ne modifie que ses propres sessions, scénarios, invitations ; la couche « contrôle des zones » est réservée au Président ; le catalogue et la bibliothèque ne contiennent aucun objectif, secret ou ligne rouge.
- Jeton en `Authorization: Bearer` (pas de cookie, donc pas de CSRF) conservé dans le stockage du navigateur : exposé à un XSS, d'où l'absence de HTML injecté et la validation de toutes les entrées (zod). Sans « rester connecté », le jeton disparaît à la fermeture du navigateur.

## Base de données (migration `0002_platform.sql`)
Conservatrice : aucune donnée supprimée ni réattribuée ; les pseudonymes en double de la v1 sont départagés par un suffixe avant la création de l'index d'unicité. Nouvelles colonnes de `users` (version des sessions, préférences, suppression) et de `scenarios` (visibilité, statut de publication), nouvelles tables `scenario_favorites`, `invitations`, `notifications`, `content_reports`, colonne `sessions.archived_at`. Les comptes existants restent valables. Les parties existantes sont inchangées (le code de participation et la création de simulation fonctionnent comme avant).

Les articles de documentation et la page de méthodologie sont **dans le code** (`apps/client/src/content/docs.ts`) plutôt qu'en base : plus simple à relire et à versionner. Une édition par un administrateur dans l'interface n'existe pas encore.

## Statuts de session affichés
Seuls des états réels du moteur : en préparation (salon d'attente), session active, terminée, expirée, et « archivée » (masquée par l'organisateur). Il n'existe pas de « brouillon » : le scénario préparé est enregistré dans « Mes scénarios ».

## Limites connues
- Pas de récupération de mot de passe perdu (conséquence de l'absence d'e-mails).
- Pas de téléversement d'avatar (monogramme coloré), pas de filtre « durée » ni « nombre de joueurs » : toutes les fiches acceptent 1 à 16 équipes et la durée se choisit au lancement, donc ces filtres ne distingueraient rien. Le filtre « complexité » repose sur une règle documentée (nombre d'acteurs).
- Pas de modération automatique de contenu : la relecture humaine est la seule protection ; les liens sont limités à deux par présentation.
- Pas de connexion Apple/Google, pas de double authentification.
- Les limiteurs de débit sont en mémoire : ils supposent une seule instance d'API.
- Non vérifié sur iPhone/iPad ; disposition ≥ 1100 px contrôlée par mesure (pas par capture).
