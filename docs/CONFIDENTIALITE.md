# Confidentialité — projet de politique (à faire valider avant publication)

Ce texte décrit le comportement réel du logiciel. Il n'a pas de valeur juridique tant qu'il n'a pas été relu par un professionnel et complété (identité du responsable de traitement, contact, durées définitives).

## Données traitées
- **Compte** : adresse email et mot de passe (haché avec scrypt, jamais stocké en clair), nom affiché. Un profil « invité » ne conserve qu'un nom affiché.
- **Parties** : décisions, déclarations publiques, communications privées, rapports, archives.
- **Journal technique** : événements de partie pour l'audit et le diagnostic (aucun secret n'est diffusé aux autres participants).

## Communications privées et analyse
- Chaque participant choisit dans le salon d'attente s'il **autorise l'analyse du texte de ses échanges** par le moteur (promesses, alliances, menaces). Sans accord de **tous** les interlocuteurs, l'échange n'est pas analysé.
- Les autres équipes et le Président n'ont jamais accès au contenu des communications privées pendant la partie.
- **Audio** : aucun enregistrement brut n'est conservé par GEONEX. La transcription automatique de la voix n'est pas implémentée ; le canal écrit est la référence.

## Conservation
- Archives de parties : conservées tant que le compte existe.
- Sessions non lancées : expirent au bout de 48 h (réglable).
- Suppression du compte : effacement des identifiants (email, mot de passe) ; les archives partagées avec d'autres participants sont conservées sous forme anonymisée.

## Mineurs et protection des données
À définir avant publication : âge minimal, consentement parental, désignation d'un responsable de traitement, registre RGPD, hébergement dans l'UE ou garanties de transfert. Aucune donnée n'est vendue ni utilisée à des fins publicitaires (les publicités sont désactivées).

## Services externes
Si l'IA est activée, les textes de scénario et de parties peuvent être envoyés au fournisseur du modèle pour la préparation et la rédaction. Si la recherche externe est activée, des requêtes sont envoyées à Wikipédia et Wikidata.
