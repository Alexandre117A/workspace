# Mise en ligne sur GitHub

**Rien n'a été poussé ni publié** : l'outil GitHub (`gh`) n'est pas installé ici, et créer un dépôt demande votre compte.

## Ce que GitHub peut héberger
GitHub Pages sert uniquement des **fichiers statiques** : il peut héberger le site (la vitrine et l'interface). Il **ne peut pas** faire tourner le serveur de jeu (API temps réel + moteur Python) : pour jouer à plusieurs, l'API et le moteur doivent être hébergés ailleurs (voir `DEPLOIEMENT.md`), puis renseignés dans la variable de dépôt `GEONEX_API_URL`.

## Étapes
1. Sur github.com : **New repository** → nom (ex. `geonex`), **vide** (sans README), **public** (Pages gratuit exige un dépôt public ; privé = offre payante).
2. Me donner l'adresse du dépôt, ou dans ce dossier :
   `git remote add origin https://github.com/VOTRE-COMPTE/geonex.git` puis `git push -u origin main` (Git vous demandera de vous identifier).
3. Dépôt › **Settings › Pages › Source : GitHub Actions**. Le workflow `.github/workflows/pages.yml` construit et publie le site à chaque envoi sur `main` : adresse `https://VOTRE-COMPTE.github.io/geonex/`.
4. (Optionnel) Dépôt › **Settings › Secrets and variables › Actions › Variables** : `GEONEX_API_URL` = adresse HTTPS de votre API.

Ne jamais pousser de fichier `.env` (déjà ignoré par Git). Le dépôt contient des images de la NASA (domaine public) ; ajoutez vos propres photos dans `apps/client/assets/chronique/` seulement si vous en avez les droits (`CREDITS.md`).
