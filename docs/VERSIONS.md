# Versions sauvegardées

La première version complète de GEONEX est figée sous deux formes, pour pouvoir y revenir à tout moment si une version
ultérieure ne convient pas.

| Version | Étiquette Git | Branche | Contenu |
|---|---|---|---|
| **v1.0** | `v1.0` | `archive/v1` | Application telle que livrée avant la refonte : moteur à règles, API temps réel, client web/mobile, fond de photographies d'archives, emblèmes des modes, logo GEONEX (globe gravé), hébergement Render + Neon. |

L'étiquette `v1.0` ne bouge jamais ; la branche `archive/v1` est une seconde pointe vers le même instantané (pratique pour
le déployer ou le corriger sans toucher à `main`). Ni l'une ni l'autre ne déclenche de redéploiement : Render ne suit que `main`.

## Retrouver cette version

- **Télécharger un zip** : https://github.com/Alexandre117A/workspace/archive/refs/tags/v1.0.zip
- **Dans un dossier à part** (sans toucher au travail en cours) :
  ```bash
  git worktree add ../geonex-v1 v1.0
  ```
- **Changer le dossier courant** pour la v1 (le travail non validé doit d'abord être validé ou mis de côté) :
  ```bash
  git switch --detach v1.0
  ```

## Remettre la v1 en ligne

Le site public (https://geonex.onrender.com) se met à jour à chaque envoi sur `main`. Pour y remettre la v1 :

```bash
git switch main
git revert --no-edit v1.0..HEAD    # annule les changements depuis la v1 en les gardant dans l'historique
git push origin main
```

(Alternative radicale : `git reset --hard v1.0` puis `git push --force-with-lease origin main` ; elle efface les commits
suivants de `main`, ils restent récupérables seulement s'ils existent sur une autre branche.)

## Garder la v1 en ligne pendant qu'on construit la suite

Tant que la suite est développée sur une autre branche (par exemple `v2`) et **n'est pas fusionnée dans `main`**,
Render continue de servir la v1 : rien ne change pour les visiteurs. On ne fusionne `v2` dans `main` qu'une fois la
nouvelle version approuvée.

## Attention : la base de données est commune

La v1 et une version suivante partagent la même base PostgreSQL (Neon). Si la suite modifie la structure des tables
(dossier `services/api/migrations`), un retour à la v1 pourrait ne plus s'entendre avec elle. Précautions : n'ajouter que
des colonnes ou tables nouvelles (jamais de suppression ni de renommage) tant que le retour doit rester possible, ou
essayer la nouvelle version sur une base Neon séparée (une « branche » Neon, gratuite) avant de l'adopter.

## v2 « Atlas stratégique » (en cours)
Développée sur la branche `v2`, **sans toucher à `main`** : le site public (https://geonex.onrender.com) reste donc en v1 tant
que `v2` n'est pas fusionnée. Pour l'essayer en local : `git switch v2` puis `Lancer GEONEX.bat`. Pour la mettre en ligne
après approbation : `git switch main && git merge v2 && git push origin main`. Pour y renoncer : `git switch main`.
Description : `docs/ATLAS.md` (identité et atlas) et `docs/PLATEFORME.md` (comptes, espace personnel, bibliothèque, documentation).

Aperçu en ligne (second service gratuit, à côté de la version stable) : `docs/DEPLOIEMENT.md`, section « Aperçu en ligne de la v2 » ; définition : `render.preview.yaml`.
