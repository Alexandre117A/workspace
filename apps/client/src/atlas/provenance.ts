import { C } from "../theme";

/** Nature d'une valeur affichée. Une donnée sans statut connu est signalée « indisponible », jamais maquillée en chiffre. */
export type Provenance = "confirmed" | "estimate" | "hypothesis" | "fiction" | "simulation" | "unknown";

export const PROVENANCE: Record<Provenance, { label: string; hint: string; color: string }> = {
  confirmed: { label: "Attesté", hint: "Fait historique ou public établi, avec source.", color: C.green },
  estimate: { label: "Estimation", hint: "Estimation GEONEX à partir de données de référence ou d'époque.", color: C.amber },
  hypothesis: { label: "Hypothèse", hint: "Hypothèse du scénario ou unité de jeu GEONEX, pas une donnée réelle.", color: C.steel },
  fiction: { label: "Fictif", hint: "Valeur d'un monde imaginaire.", color: C.brass },
  simulation: { label: "Simulation", hint: "Valeur calculée par le moteur : elle évolue avec les décisions des joueurs.", color: "#9CC0E3" },
  unknown: { label: "Donnée indisponible", hint: "Le scénario ne fournit pas cette information.", color: C.faint },
};

export function provenanceOf(status?: string | null): Provenance {
  return status === "confirmed" || status === "estimate" || status === "hypothesis" || status === "fiction" ? status : "unknown";
}
