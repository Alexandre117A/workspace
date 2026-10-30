import { useMemo } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, G, Path, Polygon, Rect } from "react-native-svg";
import { geoCentroid, geoMercator, geoPath } from "d3-geo";
import { mainland } from "../../components/GeoMap";
import { C, F, MODE_STYLE, S } from "../../theme";
import { MAP_STYLES } from "../styles";
import { PaperGrain } from "./PaperGrain";
import { CatalogEntry, useCatalog, useWorld } from "./world";

const norm = (id: unknown) => String(id).padStart(3, "0");
const FADE: any = Platform.OS === "web" ? { transitionProperty: "transform, opacity, border-color", transitionDuration: "300ms", transitionTimingFunction: "ease" } : {};

/** Vignette cartographique d'une fiche : fond choisi par le moteur (côtes seules avant la guerre froide), repères réels du scénario. */
function ThumbMap({ e, width, height, hovered }: { e: CatalogEntry; width: number; height: number; hovered: boolean }) {
  const world = useWorld();
  const st = MAP_STYLES[(e.theatre.atlas_style as keyof typeof MAP_STYLES) ?? "modern"] ?? MAP_STYLES.modern;
  const geo = useMemo(() => {
    if (!world) return null;
    const focus = new Set(e.theatre.iso_n3.map(norm));
    const coords: [number, number][] = [];
    e.zones.forEach((z) => z.region.lon != null && z.region.lat != null && coords.push([z.region.lon, z.region.lat]));
    const fit: any = { type: "FeatureCollection", features: world.countries.filter((f: any) => focus.has(norm(f.id))).map(mainland) };
    if (coords.length) fit.features.push({ type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: coords } });
    const projection = geoMercator();
    if (!fit.features.length && e.theatre.center) projection.center(e.theatre.center).scale(width * 2).translate([width / 2, height / 2]);
    else projection.fitExtent([[16, 16], [width - 16, height - 16]], fit);
    const maxScale = width / (10 * Math.PI / 180);
    if (projection.scale() > maxScale) projection.center(geoCentroid(fit)).scale(maxScale).translate([width / 2, height / 2]);
    const path = geoPath(projection);
    const visible = (f: any) => { const [[x0, y0], [x1, y1]] = path.bounds(f); return x1 > -10 && x0 < width + 10 && y1 > -10 && y0 < height + 10; };
    return {
      land: e.theatre.basemap === "land" ? path(world.land) ?? "" : null,
      countries: e.theatre.basemap === "borders" ? world.countries.filter(visible).map((f: any) => ({ id: String(f.id), d: path(f) ?? "", own: focus.has(norm(f.id)) })).filter((c) => c.d) : [],
      zones: e.zones.map((z) => ({ id: z.id, xy: z.region.lon != null && z.region.lat != null ? projection([z.region.lon, z.region.lat]) : null })).filter((z) => z.xy) as { id: string; xy: [number, number] }[],
      actors: e.actors.map((a) => ({ id: a.id, camp: a.camp, xy: a.regions[0]?.lon != null ? projection([a.regions[0].lon!, a.regions[0].lat!]) : null })).filter((a) => a.xy && a.xy[0] > 4 && a.xy[0] < width - 4 && a.xy[1] > 4 && a.xy[1] < height - 4) as { id: string; camp: string; xy: [number, number] }[],
    };
  }, [world, e, width, height]);
  return (
    <View style={{ width, height, backgroundColor: st.sea, overflow: "hidden" }} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[{ width, height }, FADE, hovered ? { transform: [{ scale: 1.08 }] } : null]}>
        <Svg width={width} height={height}>
          <Rect width={width} height={height} fill={st.sea} />
          {geo?.land ? <Path d={geo.land} fill={st.land} stroke={st.coast} strokeWidth={0.8} strokeLinejoin="round" /> : null}
          {geo?.countries.map((c) => <Path key={c.id} d={c.d} fill={c.own ? st.landHi : st.land} stroke={c.own ? st.coast : st.border} strokeWidth={c.own ? 0.9 : 0.5} strokeLinejoin="round" />)}
          {geo?.zones.map((z) => (
            <G key={z.id}>
              <Circle cx={z.xy[0]} cy={z.xy[1]} r={11} fill={st.tension} opacity={0.2} />
              <Polygon points={`${z.xy[0]},${z.xy[1] - 4.5} ${z.xy[0] + 4.5},${z.xy[1]} ${z.xy[0]},${z.xy[1] + 4.5} ${z.xy[0] - 4.5},${z.xy[1]}`} fill={st.tension} stroke={st.halo} strokeWidth={0.8} />
            </G>
          ))}
          {geo?.actors.map((a) => <Circle key={a.id} cx={a.xy[0]} cy={a.xy[1]} r={3.2} fill={st.accent} stroke={st.halo} strokeWidth={1} />)}
          <Rect x={2.5} y={2.5} width={width - 5} height={height - 5} fill="none" stroke={st.ink} strokeWidth={0.8} opacity={0.5} />
        </Svg>
        {st.texture ? <PaperGrain opacity={0.8} /> : null}
      </View>
    </View>
  );
}

function ScenarioCard({ e, width, onOpen }: { e: CatalogEntry; width: number; onOpen: (e: CatalogEntry) => void }) {
  const m = MODE_STYLE[e.mode];
  const shown = e.actors.slice(0, 4);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${e.title}, ${e.start_label}. ${m.label}. Découvrir`} onPress={() => onOpen(e)}
      style={({ hovered, pressed }: any) => [{ width, borderWidth: 1, borderColor: hovered ? m.accent : C.lineHi, borderTopWidth: 3, borderTopColor: m.accent, backgroundColor: pressed ? C.panelHi : C.panel, overflow: "hidden" }, FADE, hovered ? { transform: [{ scale: 1.015 }] } : null]}>
      {({ hovered }: any) => (
        <>
          <ThumbMap e={e} width={width - 2} height={Math.round(width * 0.46)} hovered={!!hovered} />
          <View style={{ padding: S(4), gap: S(2), flex: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2, color: m.accent, textTransform: "uppercase" }}>{m.code} · {e.mode === "historical" ? "Historique" : "Contemporain"}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.2, color: C.faint, textTransform: "uppercase" }}>{e.era_label}</Text>
            </View>
            <Text style={{ fontFamily: F.title, fontSize: 24, lineHeight: 27, color: C.text }}>{e.title}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.brass }}>{e.start_label}</Text>
            <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted }}>Région · {e.region}</Text>
            <Text numberOfLines={3} style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 19, color: C.muted }}>{e.summary}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {shown.map((a) => <View key={a.id} style={{ borderWidth: 1, borderColor: C.lineHi, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.text }}>{a.name}</Text></View>)}
              {e.actors.length > shown.length ? <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.faint, alignSelf: "center" }}>+{e.actors.length - shown.length}</Text> : null}
            </View>
            {/* Détail qui apparaît au survol : zones de crise du scénario */}
            <View style={[{ opacity: hovered ? 1 : 0.45 }, FADE]}>
              <Text numberOfLines={2} style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{e.zones.length ? `Zones : ${e.zones.map((z) => z.name).join(" · ")}` : ""}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: S(2) }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.faint }}>{e.counts.actors} acteurs · {e.counts.zones} zones</Text>
              <Text style={[{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 2, color: hovered ? m.accent : C.text, textTransform: "uppercase" }, FADE, hovered ? { transform: [{ translateX: 4 }] } : null]}>Découvrir →</Text>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

/** EXPLORER LES SCÉNARIOS : uniquement des situations que le moteur sait réellement jouer ; chaque fiche mène au parcours existant. */
export function ScenarioSection({ width, cols, go }: { width: number; cols: number; go: (path: string) => string }) {
  const { entries, state } = useCatalog();
  const gap = S(4);
  const cardW = Math.floor((width - gap * (cols - 1)) / cols);
  const open = (e: CatalogEntry) => router.push(go(`/${e.mode}?prompt=${encodeURIComponent(e.prompt)}`) as any);
  return (
    <View style={{ gap: S(4) }}>
      <View style={{ gap: S(2), maxWidth: 720 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.4, color: C.brass, textTransform: "uppercase" }}>Explorer les scénarios</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: 34, lineHeight: 38, color: C.text }}>Des situations prêtes à être jouées</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: C.muted }}>Chaque fiche est construite par le moteur à partir d'un scénario réel : période, région, acteurs et zones de crise sont ceux de la partie. Choisissez-en une, ou décrivez la vôtre.</Text>
      </View>
      {state === "ready" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>{entries.map((e) => <ScenarioCard key={e.id} e={e} width={cardW} onOpen={open} />)}</View>
      ) : (
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.faint }}>{state === "loading" ? "Chargement des scénarios…" : "Les fiches de scénarios sont momentanément indisponibles : les trois modes ci-dessus restent utilisables."}</Text>
      )}
    </View>
  );
}
