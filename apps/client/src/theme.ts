/** Design system GEONEX : palette sombre institutionnelle, accents sobres et signifiants. */
export const C = {
  bg: "#05070A",
  bg2: "#090D12",
  panel: "#0D1319",
  panelHi: "#121A22",
  line: "#1D2733",
  lineHi: "#2D3B4B",
  text: "#E7E0D1",
  muted: "#8D949C",
  faint: "#59616B",
  brass: "#C6A35C",
  brassDim: "#7E6739",
  red: "#B6433A",
  redDim: "#5E2420",
  steel: "#7393B3",
  steelDim: "#26364A",
  land: "#0F1822",
  landHi: "#1A2938",
  green: "#6F9A6B",
  amber: "#C98A34",
  paper: "#EEE5D1",
  paperDim: "#D9CDB2",
  ink: "#1C1812",
  inkSoft: "#4A4234",
  overlay: "rgba(3,5,8,0.82)",
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
