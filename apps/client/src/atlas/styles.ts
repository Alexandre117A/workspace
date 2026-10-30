import { C, A } from "../theme";

/** Matières cartographiques par famille d'époques (`theatre.atlas_style`, décidé par le moteur). Une seule structure d'interface,
 * des matériaux différents : encre, papier, mer, côtes, frontières. Les styles historiques sont clairs (surface ivoire). */
export interface MapStyle {
  key: "manuscript" | "engraved" | "staff" | "briefing" | "modern" | "fiction";
  label: string;       // intitulé de la matière, affiché dans le cartouche
  light: boolean;      // fond clair (papier) ou sombre
  paper: string;       // fond de la carte
  sea: string;
  land: string;
  landHi: string;      // acteurs du théâtre
  coast: string;
  border: string;
  grid: string;
  ink: string;         // texte et traits principaux
  inkSoft: string;
  accent: string;      // marqueurs d'acteurs
  tension: string;
  halo: string;        // contour des étiquettes (lisibilité)
  texture: boolean;    // grain de papier
}

export const MAP_STYLES: Record<MapStyle["key"], MapStyle> = {
  manuscript: { key: "manuscript", label: "Cartographie médiévale", light: true, paper: "#E7DCC1", sea: "#D3D6C6", land: "#EFE5C9", landHi: "#E2CE9E", coast: "#2B3A5C", border: "#7A6A50",
    grid: "#B9AA86", ink: "#1F2B45", inkSoft: "#5B5A56", accent: "#8B3A3F", tension: "#963F46", halo: "#EFE5C9", texture: true },
  engraved: { key: "engraved", label: "Atlas gravé", light: true, paper: "#EBE3CE", sea: "#D5DACD", land: "#F2EAD3", landHi: "#E5D3A4", coast: "#3B2F1E", border: "#8A7A5A",
    grid: "#BDB08E", ink: "#3B2F1E", inkSoft: "#6B5E48", accent: "#8F7440", tension: "#963F46", halo: "#F2EAD3", texture: true },
  staff: { key: "staff", label: "Carte d'état-major", light: true, paper: "#E9E1CC", sea: "#C9D4D0", land: "#F0E7CF", landHi: "#E6D2A0", coast: "#2B2418", border: "#8A7A5A",
    grid: "#B8AA88", ink: "#2B2418", inkSoft: "#5E5340", accent: "#7B2F34", tension: "#963F46", halo: "#F0E7CF", texture: true },
  briefing: { key: "briefing", label: "Briefing stratégique", light: false, paper: "#0B1B30", sea: "#0B1B30", land: "#15304D", landHi: "#27517C", coast: "#5D86AE", border: "#41698B",
    grid: "#1D3A5A", ink: A.ivory, inkSoft: A.stone, accent: "#8FB4D9", tension: "#CC6068", halo: "#0B1B30", texture: false },
  modern: { key: "modern", label: "Cartographie contemporaine", light: false, paper: "#0D1E34", sea: "#0D1E34", land: "#17335A", landHi: "#2A5686", coast: "#6C95BD", border: "#4A7099",
    grid: "#1F3F63", ink: A.ivory, inkSoft: A.stone, accent: "#9CC0E3", tension: "#CC6068", halo: "#0D1E34", texture: false },
  fiction: { key: "fiction", label: "Carte schématique", light: false, paper: "#0F1D30", sea: "#0F1D30", land: "#16304D", landHi: "#27517C", coast: "#5D86AE", border: "#41698B",
    grid: "#24456B", ink: A.ivory, inkSoft: A.stone, accent: C.brass, tension: "#CC6068", halo: "#0F1D30", texture: false },
};

export function mapStyleFor(key?: string | null, era?: string | null): MapStyle {
  if (key && key in MAP_STYLES) return MAP_STYLES[key as MapStyle["key"]];
  const byEra: Record<string, MapStyle["key"]> = { ancient: "manuscript", medieval: "manuscript", early_modern: "engraved", napoleonic: "staff", industrial: "staff", cold_war: "briefing", space: "fiction", fantasy: "fiction" };
  return MAP_STYLES[byEra[era ?? ""] ?? "modern"];
}

/** Couleur des camps : stable d'une simulation à l'autre. */
export const CAMP_COLORS: Record<string, string> = { camp_a: "#6FA3D8", camp_b: "#D9707A", camp_c: "#C9A45C", neutral: "#AEB6BE" };
export const campColor = (camp: string, light = false): string => {
  if (light) return ({ camp_a: "#2F5E8E", camp_b: "#963F46", camp_c: "#8F7440", neutral: "#6B6A66" } as Record<string, string>)[camp] ?? "#6B6A66";
  return CAMP_COLORS[camp] ?? "#AEB6BE";
};
