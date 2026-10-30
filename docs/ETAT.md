# État d'avancement de GEONEX

Mis à jour le 30 octobre 2026. Légende : ✅ terminé et testé · 🟡 partiel ou non testé en conditions réelles · ⛔ externe (clé, compte ou décision requise).

## Complet et testé
- ✅ **Moteur de simulation** (Python) : état du monde, quatre niveaux d'information, probabilités bornées avec tirages reproductibles et journal d'audit, planification selon durée et nombre d'équipes (30 min minimum), acteurs non joués, mémoire des engagements, capitaux et ressources (consommation, immobilisation, reconstitution), situation intérieure, classement sur 100, mentions, archives. *56 tests pytest.*
- ✅ **Scénarios** : contemporain (États identifiés, table de référence marquée « estimation », recherche datée), historique (3 bases intégrées sans connaissance du dénouement), univers fictif (génération procédurale, carte schématique signalée comme telle), questions adaptatives 2 à 5, progression réelle de la préparation avec gestion du dépassement de délai.
- ✅ **Cartes stratégiques** (5) : disponibilité round 2, usage unique, arbitrage du Président, estimation du Choc politique (30 % de départ, évolution selon pertinence/crédibilité/précision/qualité), renseignement imparfait (pourcentage et appréciation évalués séparément).
- ✅ **Communiqués de Rome** : déclenchement à partir du round 2, fenêtre de domination 68–75 %, quota, fuites fondées sur de vrais secrets, création par le Président avec contrôle de cohérence, suspension des chronomètres, consultation obligatoire avec gestion des déconnectés.
- ✅ **Serveur** (NestJS) : comptes (email/invité), rôle propriétaire distinct du Président, codes d'invitation à 10 caractères et limitation des tentatives, lobby, transfert de présidence, attribution des équipes, phases chronométrées côté serveur, Assemblée (réactions 7 s, répliques plafonnées), Diplomatie (invitations, appels simultanés, confidentialité), décisions, arbitrage avec règle de fin de délai, pause, reprise après redémarrage, archives et rapport HTML imprimable en PDF. *Test d'intégration multijoueur avec moteur réel (3 équipes + Président, déconnexion/reconnexion, Communiqué, fin de partie, archive).*
- ✅ **Confidentialité** : les données privées ne sont jamais envoyées aux clients non autorisés (vérifié par tests automatiques sur les vues d'équipe et du Président).
- ✅ **Application web** (Expo) servie par l'API : accueil, trois modes, bibliothèque et création, dossiers en enveloppe, poste de commandement équipe, poste du Président, cartes, Communiqué plein écran, dernier round, séquence de fin, résultats, archives, compte, administration. *Parcours joué dans un navigateur avec des participants de test.*
- ✅ **Lancement en un clic** (`Lancer GEONEX.bat`) et accès depuis un téléphone sur le même réseau.

## Partiel ou non testé en conditions réelles
- 🟡 **Voix** : le serveur délivre les jetons LiveKit avec droits selon la phase ; le client web se connecte, écoute et publie le micro. *Non testé : aucun serveur LiveKit disponible.* iPhone/iPad : audio natif non inclus (build de développement requise). Le canal écrit reste complet.
- 🟡 **Transcription vocale** : non implémentée (service externe de reconnaissance requis). L'extraction d'engagements fonctionne sur le **texte** des échanges, avec consentement.
- 🟡 **IA** : tout le code est présent (questions, scénarios libres, historique libre, analyse des demandes, extraction d'engagements, rédaction avec contrôle des nombres, repli serveur). *Jamais exécuté avec une vraie clé* : sans `ANTHROPIC_API_KEY`, le moteur utilise ses règles et l'interface le dit.
- 🟡 **Recherche Wikipédia** : désactivée de fait tant que `GEONEX_RESEARCH_CONTACT` n'est pas défini (politique Wikimedia). Wikidata fonctionne mais limite le débit ; le choix du dirigeant le plus récent est testé hors ligne.
- 🟡 **Cinématique de fin** : composée d'animations vectorielles adaptées au thème (spatial, naval, à voile, terrestre). Pas de vidéo générée ; interface prête pour en ajouter.
- 🟡 **Rendu visuel** : vérifié par le texte et le comportement ; non vérifié sur un vrai iPhone/iPad (captures d'écran indisponibles pendant les tests). Probablement des ajustements de mise en page à prévoir.
- 🟡 **Docker, PostgreSQL managé, EAS** : fichiers fournis, *non exécutés* (Docker absent). En local, la base embarquée PGlite exécute les mêmes migrations.
- 🟡 **Cartes historiques** : les frontières affichées sont contemporaines (Natural Earth) avec avertissement explicite ; pas de jeux de frontières d'époque.

## Externe (à votre charge)
- ⛔ Clé IA, serveur LiveKit, adresse de contact Wikimedia, hébergement (compte), compte Apple Developer, identifiant d'application définitif, relecture juridique (RGPD, mineurs) — voir `DEPLOIEMENT.md` et `CONFIDENTIALITE.md`.

## Limites connues
- Une seule instance d'API (chronomètres en mémoire) ; le multi-instance demande un bus temps réel partagé.
- Les acteurs non joués décident par règles pondérées (l'IA ne pilote pas encore leurs choix).
- Le test d'intégration utilise des chronomètres accélérés (×0,05) ; les durées nominales ont été observées à la main sur une partie.
