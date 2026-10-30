import { useEffect, useMemo, useState } from "react";
import { feature } from "topojson-client";
import { geoInterpolate } from "d3-geo";
import { API_URL } from "../../lib/api";
import { useTopo } from "../../components/GeoMap";

export type XY = [number, number];

/** Géographie mondiale (Natural Earth, domaine public) chargée une fois : pays et masse terrestre. */
export function useWorld() {
  const topo = useTopo("countries-50m");
  return useMemo(() => (topo ? { countries: (feature(topo, topo.objects.countries) as any).features as any[], land: feature(topo, topo.objects.land) as any } : null), [topo]);
}

/** Arc de grand cercle entre deux points, projeté (l'itinéraire le plus court sur le globe, pas une droite sur la carte). */
export function arcPath(projection: (p: XY) => XY | null, a: XY, b: XY, steps = 28): string {
  const interp = geoInterpolate(a, b);
  const pts: XY[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = projection(interp(i / steps) as XY);
    if (p) pts.push(p);
  }
  return pts.length < 2 ? "" : pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
}

/** Générateur pseudo-aléatoire reproductible (les illustrations sont identiques d'une visite à l'autre). */
export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- catalogue de scénarios (vitrine de l'accueil)

export interface CatalogActor { id: string; name: string; kind: string; camp: string; iso_n3: string[]; leader: string | null; leader_status: string; relevance: number; regions: { name: string; lat: number | null; lon: number | null }[] }
export interface CatalogEntry {
  id: string; mode: "contemporary" | "historical" | "fictional"; prompt: string; title: string; summary: string; start_label: string; era: string; era_label: string; tempo: string;
  region: string; knowledge_cutoff: string | null;
  theatre: { name: string; iso_n3: string[]; center: [number, number] | null; maritime: boolean; basemap: "borders" | "land" | "schematic"; map_note: string | null; atlas_style: string };
  camps: Record<string, string>; actors: CatalogActor[]; zones: { id: string; name: string; domain: string; region: { name: string; lat: number | null; lon: number | null } }[];
  counts: { actors: number; zones: number }; provider: string;
}

let cache: CatalogEntry[] | null = null;
let pending: Promise<CatalogEntry[]> | null = null;

/** Fiches de scénarios fournies par le serveur (construites par le moteur à partir de scénarios réels). */
export function useCatalog(): { entries: CatalogEntry[]; state: "loading" | "ready" | "unavailable" } {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(cache);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (cache) return;
    pending ??= fetch(`${API_URL}/api/catalog`).then((r) => r.json()).then((d) => (cache = d.scenarios ?? []));
    pending.then(setEntries).catch(() => { pending = null; setFailed(true); });
  }, []);
  if (entries) return { entries, state: entries.length ? "ready" : "unavailable" };
  return { entries: [], state: failed ? "unavailable" : "loading" };
}
