// Chemin de base du site : GitHub Pages sert un dépôt sous /<nom-du-depot>/ (défini par le workflow).
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.GEONEX_BASE_URL ? { baseUrl: process.env.GEONEX_BASE_URL } : {}) },
});
