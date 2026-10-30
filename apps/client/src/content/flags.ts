/** Drapeaux nationaux réels, embarqués localement (assets/flags/<ISO3>.png ; ONU = drapeau de l'ONU). */
const ctx = (require as any).context("../../assets/flags", false, /\.png$/i);
const map: Record<string, number> = {};
ctx.keys().forEach((k: string) => {
  map[k.replace("./", "").replace(/\.png$/i, "").toUpperCase()] = ctx(k);
});

export function flagFor(actor?: { iso_a3?: string | null; id?: string } | null): number | undefined {
  if (!actor) return undefined;
  return (actor.iso_a3 && map[actor.iso_a3.toUpperCase()]) || (actor.id && map[actor.id.toUpperCase()]) || undefined;
}
