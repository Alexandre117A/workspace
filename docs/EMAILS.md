# Mettre en service l'envoi d'e-mails de GEONEX

Mis à jour le 31 octobre 2026. Ce guide prend GEONEX là où il en est : **tout le code est prêt et testé contre un vrai serveur SMTP local ; il manque un fournisseur, un expéditeur et vos réglages**, qui exigent un compte à votre nom (je ne peux ni les créer, ni les deviner).

## 1. Où en est-on, exactement
| Élément | État |
|---|---|
| Messages (bienvenue + vérification, nouveau lien, réinitialisation, invitation, test) en HTML + texte, aux couleurs de GEONEX | ✅ prêts ; aperçu : `node scripts/test-mail.mjs --preview` → `.tools/mail-previews/*.html` |
| Chaîne SMTP complète (authentification, expéditeur, en-têtes, liens bâtis sur l'adresse publique) | ✅ prouvée par `services/api/test/mail.test.mjs` contre un serveur SMTP local avec authentification |
| Honnêteté de l'interface (jamais « envoyé » sans accord du serveur SMTP ; échec affiché ; compte jamais perdu) | ✅ testée |
| Règle « adresse vérifiée exigée » (`GEONEX_REQUIRE_VERIFIED`) | ✅ testée ; **inactive tant que l'envoi ne fonctionne pas** |
| Outils de contrôle : script `npm run mail:test`, panneau « E-mails » de l'administration | ✅ |
| Un vrai fournisseur, un vrai domaine, SPF/DKIM/DMARC, réception chez Gmail/Outlook | ⛔ **à faire de votre côté** — non vérifié |

## 2. Choisir : deux voies
**A. Avec un domaine à vous (recommandé pour un vrai lancement).** Les messages partent de `no-reply@votre-domaine`, authentifiés (SPF, DKIM, DMARC) : c'est ce qui évite le dossier « indésirables » chez Gmail et Outlook. Un nom de domaine est **payant** (de l'ordre d'une dizaine d'euros par an) : c'est une décision qui vous appartient, GEONEX n'en achète pas.
> Vérification faite le 31 octobre 2026 : `geonex.fr` et `geonex.app` **sont déjà enregistrés** (serveurs de noms `iptwins.net` pour `.fr`, `name.com` pour `.app`). S'ils ne sont pas à vous, choisissez un autre nom. Ne mettez jamais dans `GEONEX_MAIL_FROM` un domaine que vous ne contrôlez pas : le fournisseur refusera, ou les messages seront classés indésirables.

**B. Sans domaine (essai gratuit, délivrabilité limitée).** Certains fournisseurs permettent de valider une adresse d'expéditeur unique. Évitez une adresse `gmail.com` / `outlook.com` comme expéditeur : un message envoyé par un fournisseur tiers au nom de ces domaines échoue aux contrôles d'authentification (DMARC) et est souvent refusé ou classé indésirable. Utile pour tester la chaîne, pas pour un lancement public.

**Fournisseurs gratuits à comparer** (offres et limites évoluent : vérifiez sur leur site avant de choisir).
- [Brevo](https://www.brevo.com/free-smtp-server) : relais SMTP gratuit, 300 e-mails par jour d'après sa page ; authentification du domaine (SPF, DKIM, DMARC) proposée.
- [Resend](https://resend.com/docs/knowledge-base/resend-sending-limits) : gratuit à 100 e-mails par jour et 3 000 par mois d'après sa documentation ; vérifiez ses exigences sur le domaine d'expédition.

Besoin réel de GEONEX : un message par inscription, par demande de lien, par réinitialisation ou par invitation e-mail. Une centaine d'inscriptions par jour restent largement sous ces plafonds.

## 3. Pas à pas (voie A ou B)
1. **Créer le compte** chez le fournisseur choisi (à votre nom, avec votre accord sur ses conditions).
2. **Valider l'expéditeur** : le domaine (voie A, voir §4) ou l'adresse unique (voie B), en suivant son assistant.
3. **Récupérer les identifiants SMTP** : hôte, port (587 avec STARTTLS en général), identifiant et **clé SMTP** (souvent distincte du mot de passe du compte).
4. **Renseigner Render** (service → *Environment*), puis laisser le service redémarrer :

   | Variable | Valeur |
   |---|---|
   | `SMTP_URL` | `smtp://IDENTIFIANT:CLE@HOTE:587` (si l'identifiant ou la clé contient `@`, `:`, `/` ou `#`, remplacez ce caractère par son code : `%40`, `%3A`, `%2F`, `%23`) |
   | `GEONEX_MAIL_FROM` | `GEONEX <no-reply@votre-domaine>` (l'adresse validée à l'étape 2) |
   | `GEONEX_PUBLIC_URL` | `https://geonex.onrender.com` (déjà dans `render.yaml`) ; l'adresse de l'aperçu pour le service d'essai |
   | `GEONEX_MAIL_REPLY_TO` | facultatif : une adresse où recevoir les réponses (sinon, les réponses à `no-reply` se perdent) |

   Au démarrage, le journal indique `E-mails : SMTP <hôte> — expéditeur …` si tout est cohérent, ou la liste de ce qui manque.
5. **Tester**, dans cet ordre :
   - sur votre PC : mettez les mêmes variables dans `.env`, puis `npm run build:api` et `node scripts/test-mail.mjs vous@exemple.fr` : le script contrôle la configuration, la connexion et l'authentification, puis envoie un message de test, avec un diagnostic en clair en cas d'échec (identifiants, port, expéditeur refusé…) ;
   - sur le site : connectez-vous avec un compte administrateur (adresse listée dans `GEONEX_OWNER_EMAILS`), ouvrez *Administration* → panneau **E-mails** : il indique l'état réel, les 7 derniers jours (envoyés, échecs, non envoyés) et propose « Envoyer un e-mail de test à mon adresse » ;
   - **regardez la boîte de réception ET les indésirables** : « accepté par le fournisseur » ne veut pas dire « reçu ».
6. **Essai réel** : créez un compte avec une adresse à vous, ouvrez le lien reçu, vérifiez le message « Félicitations ! Votre compte GEONEX est désormais activé ».

## 4. Voie A : les enregistrements DNS
Votre fournisseur affiche les valeurs exactes à créer chez votre hébergeur DNS ; elles diffèrent d'un fournisseur à l'autre. Trois familles :
- **SPF** (TXT sur le domaine) : liste les serveurs autorisés à envoyer pour votre domaine. Un seul enregistrement SPF par domaine : on le complète, on n'en ajoute pas un second.
- **DKIM** (TXT ou CNAME fournis) : signature cryptographique des messages.
- **DMARC** (TXT sur `_dmarc.votre-domaine`) : politique de contrôle ; pour commencer, `v=DMARC1; p=none; rua=mailto:vous@votre-domaine` (observation seule), à durcir plus tard.

Contrôle après publication (la propagation peut durer de quelques minutes à quelques heures) :
```bash
nslookup -type=TXT votre-domaine
nslookup -type=TXT _dmarc.votre-domaine
```

## 5. Exiger l'adresse vérifiée (`GEONEX_REQUIRE_VERIFIED=true`)
À activer **seulement** quand le §3 est terminé et qu'un vrai message est arrivé. Effets : créer une simulation, lancer un scénario et rejoindre une session (code, invitation ou lien) demandent une adresse vérifiée ; les profils invités sont refusés ; un compte non vérifié voit « Confirmez votre adresse e-mail » et peut demander un nouveau lien (Mon espace → Mon profil). Les comptes créés avant la mise en service des e-mails sont non vérifiés : ils devront d'abord recevoir un lien. Marche arrière : supprimer la variable. Si l'envoi tombe en panne (trois échecs consécutifs), la règle se suspend d'elle-même jusqu'au prochain envoi réussi, pour ne bloquer personne.

## 6. Exploitation
- **Suivi** : panneau « E-mails » (états sur 7 jours, derniers échecs). Un échec n'annule jamais une inscription : l'utilisateur voit « envoi impossible pour le moment » et un bouton pour réessayer.
- **Clé SMTP compromise ou changée** : générez-en une nouvelle chez le fournisseur, mettez à jour `SMTP_URL`, supprimez l'ancienne.
- **Changer de fournisseur** : modifier `SMTP_URL` (et `GEONEX_MAIL_FROM` si le domaine change). Rien d'autre dans le code.
- **Vie privée** : le fournisseur voit les adresses des destinataires et le contenu des messages ; `/privacy` le mentionne en termes généraux. Si vous nommez le fournisseur dans cette page, faites-le après l'avoir choisi.

## 7. Ce qui n'a pas été vérifié
- Aucun e-mail n'a été envoyé à une vraie boîte, avec un vrai fournisseur.
- La délivrabilité (Gmail, Outlook, Orange…) et l'affichage dans les vrais clients de messagerie ; le HTML est conçu pour eux (tableaux, styles en ligne, pas de grande image) et vérifié dans un navigateur seulement.
- Les enregistrements SPF, DKIM et DMARC, qui dépendent de votre domaine.
