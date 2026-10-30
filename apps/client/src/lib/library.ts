import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { api } from "./api";
import { cleanMessage, useAuth } from "./auth";

export interface LibItem {
  key: string;
  source: "official" | "community" | "mine";
  mode: "contemporary" | "historical" | "fictional";
  title: string;
  summary: string;
  startLabel: string;
  eraId: string;
  eraLabel: string;
  eraGroup: string;
  regionGroup: string;
  region: string;
  actors: { id: string; name: string; kind?: string; leader?: string | null; region?: { lat: number | null; lon: number | null } | null }[];
  zones: number;
  complexity: string;
  keywords: string[];
  author: string | null;
  prompt?: string;
  scenarioId?: string;
  publication?: { status: string; reason?: string | null };
  theatre: { name: string; iso_n3: string[]; center: [number, number] | null; maritime: boolean; basemap: string; atlas_style: string; map_note: string | null; zones: { name: string; lat: number | null; lon: number | null }[] };
  favorite?: boolean;
  createdAt?: string;
}

export const MODE_NAMES = { contemporary: "Contemporain", historical: "Historique", fictional: "Personnalisé" } as const;
export const SOURCE_NAMES = { official: "Fiches officielles", community: "Communauté", mine: "Mes scénarios" } as const;
export const COMPLEXITY_ORDER = ["Initiation", "Intermédiaire", "Avancé", "Expert"];
export const ERA_ORDER = ["Antiquité", "Moyen Âge", "Époque moderne", "XIXe siècle", "Première moitié du XXe siècle", "Guerre froide", "Monde contemporain", "Futur ou univers alternatif"];

/** Texte sans accents ni majuscules, pour une recherche tolérante. */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface Filters { q: string; mode: string | null; era: string | null; region: string | null; complexity: string | null; source: string | null; sort: "relevance" | "title" | "complexity" }
export const NO_FILTERS: Filters = { q: "", mode: null, era: null, region: null, complexity: null, source: null, sort: "relevance" };

const haystack = (i: LibItem) => norm([i.title, i.summary, i.region, i.regionGroup, i.eraLabel, i.eraGroup, i.startLabel, i.author ?? "", MODE_NAMES[i.mode], ...i.keywords, ...i.actors.map((a) => a.name), ...i.theatre.zones.map((z) => z.name)].join(" | "));

/** Filtres combinables ; la recherche exige que chaque mot saisi figure dans la fiche (titre, région, pays, époque, acteurs, mots-clés…). */
export function applyFilters(items: LibItem[], f: Filters): LibItem[] {
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  const out = items.filter((i) => {
    if (f.mode && i.mode !== f.mode) return false;
    if (f.era && i.eraGroup !== f.era) return false;
    if (f.region && i.regionGroup !== f.region) return false;
    if (f.complexity && i.complexity !== f.complexity) return false;
    if (f.source && i.source !== f.source) return false;
    if (words.length) { const h = haystack(i); if (!words.every((w) => h.includes(w))) return false; }
    return true;
  });
  const rank = (i: LibItem) => (i.source === "mine" ? 0 : i.source === "official" ? 1 : 2);
  if (f.sort === "title") out.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  else if (f.sort === "complexity") out.sort((a, b) => COMPLEXITY_ORDER.indexOf(a.complexity) - COMPLEXITY_ORDER.indexOf(b.complexity) || a.title.localeCompare(b.title, "fr"));
  else out.sort((a, b) => rank(a) - rank(b));
  return out;
}

/** Valeurs réellement présentes dans les données, avec leur effectif : un filtre n'est proposé que s'il peut distinguer des fiches. */
export function facet(items: LibItem[], pick: (i: LibItem) => string, order?: string[]): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(pick(i), (m.get(pick(i)) ?? 0) + 1);
  const arr = [...m].map(([value, count]) => ({ value, count }));
  return order ? arr.sort((a, b) => (order.indexOf(a.value) + 99) % 99 - (order.indexOf(b.value) + 99) % 99) : arr.sort((a, b) => a.value.localeCompare(b.value, "fr"));
}

export function useLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      setItems((await api<{ items: LibItem[] }>("/library")).items);
    } catch (e: any) {
      setError(cleanMessage(e.message));
    }
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);
  return { items, error, reload: load, setItems };
}

/** Actions d'une fiche : favoris et lancement d'une simulation (avec retour automatique après connexion). */
export function useScenarioActions(reload?: () => void) {
  const { user } = useAuth();
  const needAccount = (next: string) => router.push({ pathname: "/auth", params: { mode: "register", next } } as any);

  const toggleFavorite = async (item: LibItem, nextPath: string) => {
    if (!user) return needAccount(nextPath);
    await api("/library/favorite", { body: { key: item.key, on: !item.favorite } });
    reload?.();
  };

  const start = async (item: LibItem, nextPath: string) => {
    if (item.source === "official") {
      const target = `/${item.mode}?prompt=${encodeURIComponent(item.prompt ?? item.title)}`;
      return router.push((user ? target : `/auth?mode=register&next=${encodeURIComponent(target)}`) as any);
    }
    if (!user) return needAccount(nextPath);
    if (item.source === "mine") return router.push({ pathname: "/create/[id]", params: { id: item.scenarioId! } });
    const r = await api<{ scenarioId: string }>(`/library/fork/${item.scenarioId}`, { body: {} });
    router.push({ pathname: "/create/[id]", params: { id: r.scenarioId } });
  };
  return { toggleFavorite, start, user };
}
