import { useMemo } from "react";
import { Image, Platform, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Pattern, Polygon, Rect, Stop, Text as SvgText } from "react-native-svg";
import { geoConicConformal, geoGraticule, geoMercator, geoPath } from "d3-geo";
import { PHOTOS } from "../../content/photos";
import { C, F } from "../../theme";

const FADE: any = Platform.OS === "web" ? { transitionProperty: "transform, opacity", transitionDuration: "500ms", transitionTimingFunction: "ease" } : {};
import { PaperGrain } from "./PaperGrain";
import { arcPath, CatalogEntry, useWorld, XY } from "./world";

/**
 * Trois compositions illustrées, une par mode, construites à partir de données cartographiques réelles (Natural Earth) :
 *  - MODE I   « Le monde sous tension » : Eurasie contemporaine, capitales, foyers de crise du catalogue de scénarios ;
 *  - MODE II  « Les frontières du temps » : carte d'archive de la campagne de 1415 (Normandie, Picardie, Manche) ;
 *  - MODE III « Construire un monde » : photographie réelle de la Terre de nuit (NASA).
 * Chaque carte reçoit un dégradé qui garde le texte lisible ; les compositions sont décoratives (masquées aux lecteurs d'écran).
 */
const hidden = { accessible: false, importantForAccessibility: "no-hide-descendants" as const, pointerEvents: "none" as const };
const CAPITALS: Record<string, XY> = { Moscou: [37.62, 55.75], Pékin: [116.4, 39.9], "New Delhi": [77.2, 28.6], Téhéran: [51.4, 35.7], Bruxelles: [4.35, 50.85], Ankara: [32.85, 39.93], Tokyo: [139.7, 35.7] };
const FALLBACK_FOCI: { name: string; at: XY }[] = [{ name: "Détroit de Taïwan", at: [119.6, 24.3] }, { name: "Détroit d'Ormuz", at: [56.25, 26.57] }, { name: "Cachemire", at: [74.3, 34.2] }];

function photoFor(label: string) {
  const l = label.toUpperCase();
  return PHOTOS.find((p) => p.label === l)?.src;
}

export function ContemporaryArt({ width, height, hovered, entries }: { width: number; height: number; hovered: boolean; entries: CatalogEntry[] }) {
  const world = useWorld();
  const foci = useMemo(() => {
    const f = entries.filter((e) => e.mode === "contemporary" && e.theatre.center).map((e) => ({ name: e.theatre.name, at: e.theatre.center as XY }));
    return f.length ? f : FALLBACK_FOCI;
  }, [entries]);
  const geo = useMemo(() => {
    if (!world) return null;
    const projection = geoConicConformal().parallels([30, 60]).rotate([-62, 0]);
    projection.fitExtent([[width * 0.18, 8], [width - 6, height - 14]], { type: "MultiPoint", coordinates: [[-8, 28], [-8, 70], [60, 76], [140, 62], [140, 12], [60, 6]] } as any);
    const path = geoPath(projection);
    const countries = world.countries.map((f: any) => ({ id: String(f.id), d: path(f) ?? "" })).filter((c) => c.d);
    const caps = Object.entries(CAPITALS).map(([n, at]) => ({ n, at, xy: projection(at) as XY }));
    const arcs = [["Bruxelles", "Moscou"], ["Moscou", "Pékin"], ["Pékin", "Tokyo"], ["Moscou", "Téhéran"], ["Téhéran", "New Delhi"], ["New Delhi", "Pékin"], ["Ankara", "Téhéran"], ["Bruxelles", "Ankara"]]
      .map(([a, b]) => arcPath(projection as any, CAPITALS[a], CAPITALS[b]));
    return { projection, countries, caps, arcs, foci: foci.map((f) => ({ ...f, xy: projection(f.at) as XY })), graticule: path(geoGraticule().step([10, 10])()) ?? "" };
  }, [world, width, height, foci]);
  const photo = photoFor("Conseil de sécurité de l'ONU") ?? photoFor("Sommet du G20");
  return (
    <View {...hidden} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "#0C1B30" }}>
      {photo ? <Image source={photo} resizeMode="cover" style={[{ position: "absolute", right: 0, top: 0, width: width * 0.62, height, opacity: 0.2 }, Platform.OS === "web" ? ({ filter: "grayscale(1) contrast(1.15)" } as any) : null]} /> : null}
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="m1fade" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#0C1B30" stopOpacity="0.97" /><Stop offset="0.46" stopColor="#0C1B30" stopOpacity="0.84" /><Stop offset="1" stopColor="#0C1B30" stopOpacity="0.1" /></LinearGradient>
          <LinearGradient id="m1bot" x1="0" y1="0" x2="0" y2="1"><Stop offset="0.6" stopColor="#0C1B30" stopOpacity="0" /><Stop offset="1" stopColor="#0C1B30" stopOpacity="0.85" /></LinearGradient>
        </Defs>
        {geo ? (
          <G opacity={hovered ? 1 : 0.92}>
            <Path d={geo.graticule} stroke="#284D74" strokeWidth={0.5} fill="none" opacity={0.7} />
            {geo.countries.map((c) => <Path key={c.id} d={c.d} fill="#15335A" stroke="#41698B" strokeWidth={0.45} opacity={0.95} />)}
            {geo.arcs.map((d, i) => <Path key={i} d={d} fill="none" stroke="#9CC0E3" strokeWidth={0.9} strokeDasharray="2,4" opacity={0.6} />)}
            {geo.caps.map((c) => <Circle key={c.n} cx={c.xy[0]} cy={c.xy[1]} r={2.2} fill="#CFE0F2" />)}
            {geo.foci.map((f) => (
              <G key={f.name}>
                <Circle cx={f.xy[0]} cy={f.xy[1]} r={hovered ? 17 : 13} fill="#CC6068" opacity={0.16} />
                <Circle cx={f.xy[0]} cy={f.xy[1]} r={6} fill="none" stroke="#CC6068" strokeWidth={1.2} />
                <Circle cx={f.xy[0]} cy={f.xy[1]} r={2.2} fill="#E8878E" />
              </G>
            ))}
          </G>
        ) : null}
        <Rect width={width} height={height} fill="url(#m1fade)" />
        <Rect width={width} height={height} fill="url(#m1bot)" />
        <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} fill="none" stroke="#41698B" strokeWidth={1} opacity={0.5} />
      </Svg>
    </View>
  );
}

const WAYPOINTS: { name: string; at: XY; label?: boolean }[] = [
  { name: "Harfleur", at: [0.2, 49.51], label: true }, { name: "Arques", at: [1.12, 49.88] }, { name: "Eu", at: [1.42, 50.05] },
  { name: "Passage de la Somme", at: [3.0, 49.82], label: true }, { name: "Azincourt", at: [2.14, 50.46], label: true }, { name: "Calais", at: [1.85, 50.95], label: true },
];

export function HistoricalArt({ width, height, hovered }: { width: number; height: number; hovered: boolean }) {
  const world = useWorld();
  const geo = useMemo(() => {
    if (!world) return null;
    const projection = geoMercator();
    projection.fitExtent([[width * 0.22, 14], [width - 10, height - 18]], { type: "MultiPoint", coordinates: [[-2.6, 48.7], [4.6, 48.7], [4.6, 51.7], [-2.6, 51.7]] } as any);
    const path = geoPath(projection);
    const pts = WAYPOINTS.map((w) => ({ ...w, xy: projection(w.at) as XY }));
    return { land: path(world.land) ?? "", pts, route: pts.map((p, i) => `${i ? "L" : "M"}${p.xy[0].toFixed(1)},${p.xy[1].toFixed(1)}`).join(" "), graticule: path(geoGraticule().step([1, 1])()) ?? "" };
  }, [world, width, height]);
  return (
    <View {...hidden} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "#D9D2BC" }}>
      <Svg width={width} height={height}>
        <Defs>
          <Pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><Line x1="0" y1="3" x2="6" y2="3" stroke="#7D8C86" strokeWidth={0.5} opacity={0.5} /></Pattern>
          <LinearGradient id="m2fade" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#10233D" stopOpacity="0.97" /><Stop offset="0.45" stopColor="#10233D" stopOpacity="0.86" /><Stop offset="1" stopColor="#10233D" stopOpacity="0.05" /></LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="#D5D8C9" />
        <Rect width={width} height={height} fill="url(#hatch)" />
        {geo ? (
          <G>
            <Path d={geo.graticule} stroke="#9A8F70" strokeWidth={0.5} fill="none" opacity={0.7} />
            <Path d={geo.land} fill="#EFE4C8" stroke="#3B2F1E" strokeWidth={0.9} strokeLinejoin="round" />
            <Path d={geo.route} fill="none" stroke="#963F46" strokeWidth={hovered ? 2.4 : 1.9} strokeDasharray="7,4" strokeLinecap="round" />
            {geo.pts.map((p, i) => (
              <G key={p.name}>
                <Circle cx={p.xy[0]} cy={p.xy[1]} r={i === geo.pts.length - 1 || i === 0 ? 4.2 : 2.6} fill={i === 4 ? "#963F46" : "#3B2F1E"} stroke="#EFE4C8" strokeWidth={1.2} />
                {p.label ? <><SvgText x={p.xy[0] + 7} y={p.xy[1] - 5} fontSize={10} fontFamily={F.titleItalic} fill="#EFE4C8" stroke="#EFE4C8" strokeWidth={3} strokeLinejoin="round">{p.name}</SvgText><SvgText x={p.xy[0] + 7} y={p.xy[1] - 5} fontSize={10} fontFamily={F.titleItalic} fill="#3B2F1E">{p.name}</SvgText></> : null}
              </G>
            ))}
            {/* Légende de la carte */}
            <G transform={`translate(${width - 118} 12)`}>
              <Rect width={106} height={40} fill="#F5EEDB" stroke="#3B2F1E" strokeWidth={0.8} opacity={0.94} />
              <SvgText x={7} y={13} fontSize={8} fontFamily={F.monoBold} fill="#3B2F1E">LÉGENDE</SvgText>
              <Line x1={7} x2={30} y1={24} y2={24} stroke="#963F46" strokeWidth={1.8} strokeDasharray="5,3" />
              <SvgText x={36} y={27} fontSize={8.5} fontFamily={F.sans} fill="#3B2F1E">Itinéraire, 1415</SvgText>
              <SvgText x={7} y={36} fontSize={7} fontFamily={F.sans} fill="#6B5E48">tracé simplifié</SvgText>
            </G>
          </G>
        ) : null}
        {/* Rose des vents */}
        <G transform={`translate(${width * 0.3} ${height - 38})`} opacity={0.7}>
          <Circle r={13} fill="none" stroke="#3B2F1E" strokeWidth={0.8} />
          <Path d="M0,-18 L3.5,0 L0,18 L-3.5,0 Z" fill="#3B2F1E" />
          <Path d="M-18,0 L0,-2.8 L18,0 L0,2.8 Z" fill="none" stroke="#3B2F1E" strokeWidth={0.8} />
        </G>
        <Rect width={width} height={height} fill="url(#m2fade)" />
        <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} fill="none" stroke="#B89A5D" strokeWidth={1} opacity={0.55} />
      </Svg>
      <PaperGrain opacity={0.8} />
    </View>
  );
}

/** MODE III : une vraie photographie, la Terre de nuit vue de la Station spatiale (NASA, domaine public) : des réseaux de lumière,
 * des territoires à relier. Sobre et sérieuse, dans le ton du site ; le texte reste sur une zone sombre. */
export function WorldBuildArt({ width, height, hovered }: { width: number; height: number; hovered: boolean }) {
  const photo = photoFor("La Terre de nuit");
  return (
    <View {...hidden} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "#0A1626", overflow: "hidden" }}>
      {photo ? (
        <Image source={photo} resizeMode="cover"
          style={[{ position: "absolute", right: -width * 0.08, top: 0, width: width * 1.12, height, opacity: hovered ? 1 : 0.92 }, FADE,
            Platform.OS === "web" ? ({ filter: "saturate(0.85) brightness(1.05)" } as any) : null, hovered ? { transform: [{ scale: 1.04 }] } : null]} />
      ) : null}
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="m3fade" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#0A1626" stopOpacity="0.97" /><Stop offset="0.62" stopColor="#0A1626" stopOpacity="0.9" /><Stop offset="0.9" stopColor="#0A1626" stopOpacity="0.32" /><Stop offset="1" stopColor="#0A1626" stopOpacity="0.1" /></LinearGradient>
          <LinearGradient id="m3tint" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#10233D" stopOpacity="0.35" /><Stop offset="1" stopColor="#0B1420" stopOpacity="0.55" /></LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#m3tint)" />
        <Rect width={width} height={height} fill="url(#m3fade)" />
        <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} fill="none" stroke="#41698B" strokeWidth={1} opacity={0.5} />
        <SvgText x={width - 12} y={20} fontSize={8.5} fontFamily={F.mono} textAnchor="end" fill="#CFE0F2" opacity={0.6}>PHOTO · NASA / STATION SPATIALE</SvgText>
      </Svg>
    </View>
  );
}
