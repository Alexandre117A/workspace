/**
 * Photographies d'archives du fond défilant. AUCUN visuel dessiné ni généré : uniquement des photographies.
 *
 * Pour en ajouter : déposer simplement le fichier (.jpg/.png/.webp) dans `apps/client/assets/chronique/`.
 * Il est détecté automatiquement. Pour lui donner une année et une légende, ajouter une ligne dans
 * `assets/chronique/credits.json` : { "file": "yalta.jpg", "year": "1945", "label": "Conférence de Yalta",
 * "theme": "diplomatie", "credit": "…", "source": "…" }. Ne déposer que des images libres de droits ou à vous.
 */
import credits from "../../assets/chronique/credits.json";

export interface Photo {
  src: number;
  year: string;
  label: string;
  theme: string;
}

const ctx = (require as any).context("../../assets/chronique", false, /\.(jpe?g|png|webp)$/i);
const meta: Record<string, any> = Object.fromEntries((credits as any[]).map((c) => [c.file, c]));

export const PHOTOS: Photo[] = ctx.keys().map((k: string) => {
  const file = k.replace("./", "");
  const m = meta[file] ?? {};
  return {
    src: ctx(k),
    year: m.year ?? "",
    label: String(m.label ?? file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")).toUpperCase(),
    theme: m.theme ?? "archives",
  };
});
