import { useMemo } from "react";
import { Image, Platform, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Pattern, Polygon, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Delaunay } from "d3-delaunay";
import { geoConicConformal, geoGraticule, geoMercator, geoPath } from "d3-geo";
import { PHOTOS } from "../../content/photos";
import { C, F } from "../../theme";
import { PaperGrain } from "./HeroMap";
import { arcPath, CatalogEntry, rng, useWorld, XY } from "./world";

/**
 * Trois compositions illustrées, une par mode, construites à partir de données cartographiques réelles (Natural Earth) :
 *  - MODE I   « Le monde sous tension » : Eurasie contemporaine, capitales, foyers de crise du catalogue de scénarios ;
 *  - MODE II  « Les frontières du temps » : carte d'archive de la campagne de 1415 (Normandie, Picardie, Manche) ;
 *  - MODE III « Construire un monde » : table de cartographe, territoire inachevé en cours de tracé.
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

const NOTES = [{ t: "Nation ?", i: 3 }, { t: "Capitale à fixer", i: 9 }, { t: "Frontière à tracer", i: 14 }, { t: "Alliance ?", i: 20 }];

export function ConstructionArt({ width, height, hovered }: { width: number; height: number; hovered: boolean }) {
  const geo = useMemo(() => {
    const r = rng(2050);
    const x0 = width * 0.34, x1 = width - 10, y0 = 12, y1 = height - 16;
    const pts: [number, number][] = [];
    const cols = 6, rows = 5;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) pts.push([x0 + ((i + 0.5 + (r() - 0.5) * 0.8) / cols) * (x1 - x0), y0 + ((j + 0.5 + (r() - 0.5) * 0.8) / rows) * (y1 - y0)]);
    const vor = Delaunay.from(pts).voronoi([x0, y0, x1, y1]);
    const cells = pts.map((p, i) => ({ i, p, poly: (vor.cellPolygon(i) ?? []) as [number, number][], done: (i * 7) % 5 < 3 }));
    return { cells, x0, x1, y0, y1 };
  }, [width, height]);
  const fills = ["#41698B", "#B89A5D", "#284D74", "#963F46", "#6C86A3"];
  return (
    <View {...hidden} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "#0E2038" }}>
      <Svg width={width} height={height}>
        <Defs>
          <Pattern id="grid3" width="22" height="22" patternUnits="userSpaceOnUse"><Path d="M22 0 L0 0 0 22" fill="none" stroke="#284D74" strokeWidth={0.5} opacity={0.75} /></Pattern>
          <LinearGradient id="m3fade" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#0E2038" stopOpacity="0.97" /><Stop offset="0.42" stopColor="#0E2038" stopOpacity="0.86" /><Stop offset="1" stopColor="#0E2038" stopOpacity="0.05" /></LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#grid3)" />
        {/* Territoire inachevé : cellules remplies = zones politiques définies ; pointillés = frontières encore à tracer. */}
        {geo.cells.map((c) => (
          <Path key={c.i} d={`M${c.poly.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" L")} Z`} fill={c.done ? fills[c.i % fills.length] : "none"} fillOpacity={c.done ? 0.28 : 0} stroke={c.done ? "#9CC0E3" : "#6C86A3"} strokeWidth={c.done ? 1.1 : 0.8} strokeDasharray={c.done ? undefined : "4,4"} strokeLinejoin="round" />
        ))}
        {/* Constructions géométriques : compas, médiatrices, graduations */}
        <Circle cx={(geo.x0 + geo.x1) / 2 + 20} cy={(geo.y0 + geo.y1) / 2} r={Math.min(width, height) * (hovered ? 0.34 : 0.3)} fill="none" stroke="#B89A5D" strokeWidth={0.8} strokeDasharray="1,5" opacity={0.8} />
        <Line x1={geo.x0 - 8} y1={geo.y1 - 30} x2={geo.x1} y2={geo.y0 + 40} stroke="#B89A5D" strokeWidth={0.7} opacity={0.5} />
        <Line x1={geo.x0 + 40} y1={geo.y0 - 4} x2={geo.x1 - 30} y2={geo.y1 + 4} stroke="#B89A5D" strokeWidth={0.7} opacity={0.35} />
        {Array.from({ length: 24 }).map((_, i) => <Line key={i} x1={geo.x0 + i * ((geo.x1 - geo.x0) / 23)} x2={geo.x0 + i * ((geo.x1 - geo.x0) / 23)} y1={height - 8} y2={height - (i % 5 === 0 ? 17 : 12)} stroke="#9CC0E3" strokeWidth={0.8} opacity={0.7} />)}
        {geo.cells.filter((c) => c.i % 6 === 1).map((c) => (
          <G key={`m${c.i}`}><Line x1={c.p[0] - 7} x2={c.p[0] + 7} y1={c.p[1]} y2={c.p[1]} stroke="#F3F0E9" strokeWidth={1} /><Line y1={c.p[1] - 7} y2={c.p[1] + 7} x1={c.p[0]} x2={c.p[0]} stroke="#F3F0E9" strokeWidth={1} /><Circle cx={c.p[0]} cy={c.p[1]} r={2} fill="#B89A5D" /></G>
        ))}
        {NOTES.map((n) => {
          const c = geo.cells[n.i];
          if (c && c.p[0] > width - 160 && c.p[1] > height - 150) return null; // zone de l'emblème du mode
          return c ? <SvgText key={n.t} x={c.p[0] + 6} y={c.p[1] - 7} fontSize={8.5} fontFamily={F.mono} fill="#CFE0F2" opacity={0.85}>{n.t}</SvgText> : null;
        })}
        <Rect width={width} height={height} fill="url(#m3fade)" />
        <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} fill="none" stroke="#41698B" strokeWidth={1} opacity={0.5} />
      </Svg>
    </View>
  );
}
