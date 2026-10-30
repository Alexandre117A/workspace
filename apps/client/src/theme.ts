/** Palette officielle « Atlas stratégique » : les neuf couleurs de référence de la direction artistique. */
export const A = {
  night: "#0B1420",      // bleu nuit : fonds profonds
  navy: "#10233D",       // bleu marine : conteneurs et panneaux
  atlas: "#284D74",      // bleu atlas : cartographie et accents
  institutional: "#41698B", // bleu institutionnel : éléments secondaires
  ivory: "#F3F0E9",      // ivoire : surfaces claires
  cream: "#FAF9F6",      // blanc cassé : fonds éditoriaux
  stone: "#AEB6BE",      // gris pierre : métadonnées
  brass: "#B89A5D",      // or laiton : accents historiques
  deepRed: "#963F46",    // rouge profond : tensions et alertes
};

/** Design system GEONEX : alternance de bleu nuit, de panneaux marine et de surfaces ivoire. Les variantes « texte »
 * (steel, red) sont éclaircies par rapport à la palette de référence pour garder un contraste lisible sur fond sombre. */
export const C = {
  bg: A.night,
  bg2: "#0F1C2E",
  panel: A.navy,
  panelHi: "#173250",
  line: "#1F3A58",
  lineHi: "#2F5780",
  text: A.ivory,
  muted: A.stone,
  faint: "#8493A3",
  brass: A.brass,
  brassDim: "#7C6838",
  red: "#CC6068",
  redDeep: A.deepRed,
  redDim: "#4A232B",
  steel: "#7FA6CC",
  steelDim: "#27496D",
  institutional: A.institutional,
  atlas: A.atlas,
  land: "#13294A",
  landHi: "#21456F",
  green: "#78A57A",
  amber: "#D09A45",
  paper: A.ivory,
  paperDim: "#E3DCCA",
  cream: A.cream,
  ink: "#1B2430",
  inkSoft: "#4B5866",
  overlay: "rgba(8,14,23,0.86)",
};

/** Identités des cinq cartes stratégiques. */
export const CARD_STYLE = {
  targeted_intel: { color: "#3F8C8A", code: "R-1", glyph: "◎", subtitle: "Recherche ciblée sur deux acteurs" },
  interception: { color: "#7B69B8", code: "I-2", glyph: "⌁", subtitle: "Capter une transmission précise" },
  information_warfare: { color: "#C9822F", code: "G-3", glyph: "◈", subtitle: "Modifier une perception" },
  new_front: { color: "#6E8D49", code: "F-4", glyph: "⬡", subtitle: "Ouvrir un théâtre d'opérations" },
  political_shock: { color: "#A9443F", code: "C-5", glyph: "⚑", subtitle: "Ébranler un pouvoir intérieur" },
} as const;

export const F = {
  title: "CormorantGaramond_600SemiBold",
  titleLight: "CormorantGaramond_400Regular",
  titleItalic: "CormorantGaramond_500Medium_Italic",
  sans: "IBMPlexSans_400Regular",
  sansMed: "IBMPlexSans_500Medium",
  sansBold: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoBold: "IBMPlexMono_600SemiBold",
};

export const S = (n: number) => n * 4;

export const MODE_STYLE = {
  contemporary: { label: "Simulation contemporaine", code: "MODE I", accent: C.steel, tagline: "Les crises du monde actuel, reconstituées à partir de sources vérifiables." },
  historical: { label: "Simulation historique", code: "MODE II", accent: C.brass, tagline: "Revivre un moment décisif sans connaître la suite de l'histoire." },
  fictional: { label: "Créer une simulation", code: "MODE III", accent: C.red, tagline: "Concevoir un univers : nations, empires, planètes ou galaxies." },
} as const;
