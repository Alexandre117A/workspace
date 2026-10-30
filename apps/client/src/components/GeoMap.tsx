import { useEffect, useMemo, useState } from "react";
import { GestureResponderEvent, Pressable, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Text as SvgText } from "react-native-svg";
import { geoArea, geoBounds, geoCentroid, geoDistance, geoGraticule10, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { API_URL } from "../lib/api";
import { C, F } from "../theme";

type Topo = any;
const cache: Record<string, Topo> = {};
const pending: Record<string, Promise<Topo>> = {};

/** Frontières réelles Natural Earth (domaine public), chargées à la demande depuis l'API. */
function useTopo(name: "countries-110m" | "countries-50m") {
  const [topo, setTopo] = useState<Topo | null>(cache[name] ?? null);
  useEffect(() => {
    if (cache[name]) return;
    pending[name] ??= fetch(`${API_URL}/api/geo/${name}`).then((r) => r.json()).then((t) => (cache[name] = t));
    pending[name].then(setTopo).catch(() => setTopo(null));
  }, [name]);
  return topo;
}

/** Garde la partie principale d'un pays (ex. France métropolitaine + Corse, sans les territoires lointains). */
function mainland(f: any) {
  if (f.geometry?.type !== "MultiPolygon") return f;
  const polys = f.geometry.coordinates.map((c: any) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: c } }));
  const main = polys.reduce((a: any, b: any) => (geoArea(b) > geoArea(a) ? b : a));
  const mc = geoCentroid(main);
  const keep = polys.filter((p: any) => geoDistance(geoCentroid(p), mc) < 0.16);
  return { ...f, geometry: { type: "MultiPolygon", coordinates: keep.map((p: any) => p.geometry.coordinates) } };
}

export interface MapPoint {
  lat?: number | null;
  lon?: number | null;
  x?: number | null;
  y?: number | null;
  label?: string;
  color?: string;
  kind?: "zone" | "event" | "city" | "pick";
}

export function GeoMap({
  width, height, highlight = [], focus = [], center, points = [], variant = "theatre", fictional, warning, onPick, showLabels = true,
}: {
  width: number; height: number; highlight?: string[]; focus?: string[]; center?: [number, number] | null; points?: MapPoint[];
  variant?: "home" | "theatre"; fictional?: { id: string; name: string; x: number; y: number; owner?: string }[] | null; warning?: string | null;
  onPick?: (p: { lat?: number; lon?: number; x?: number; y?: number }) => void; showLabels?: boolean;
}) {
  if (fictional && fictional.length) return <FictionalMap width={width} height={height} regions={fictional} highlight={highlight} points={points} onPick={onPick} />;
  return <RealMap {...{ width, height, highlight, focus, center, points, variant, warning, onPick, showLabels }} />;
}

function RealMap({ width, height, highlight, focus, center, points, variant, warning, onPick, showLabels }: any) {
  const topo = useTopo(variant === "home" ? "countries-50m" : "countries-110m");
  const geo = useMemo(() => {
    if (!topo || width < 10 || height < 10) return null;
    const all: any[] = (feature(topo, topo.objects.countries) as any).features;
    const focusIds: string[] = focus.length ? focus : highlight;
    let targets = all.filter((f) => focusIds.includes(String(f.id))).map(mainland);
    const pts = points.filter((p: MapPoint) => p.lat != null && p.lon != null);
    const fc: any = { type: "FeatureCollection", features: [...targets] };
    for (const p of pts) fc.features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } });
    if (!fc.features.length && center) {
      fc.features.push({ type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: [[center[0] - 18, center[1] - 12], [center[0] + 18, center[1] + 12]] } });
    }
    if (!fc.features.length) fc.features.push({ type: "Sphere" });
    const pad = variant === "home" ? Math.min(width, height) * 0.12 : Math.min(width, height) * 0.08;
    const projection = geoMercator().fitExtent([[pad, pad], [width - pad, height - pad]], fc);
    if (fc.features.length === 1 && fc.features[0].geometry?.type === "Point") projection.scale(width * 1.2).center(fc.features[0].geometry.coordinates);
    const path = geoPath(projection);
    // Seuls les pays visibles sont dessinés (fluidité sur mobile).
    const tl = projection.invert!([0, 0]) ?? [-180, 90];
    const br = projection.invert!([width, height]) ?? [180, -90];
    const visible = all.filter((f) => {
      const [[x0, y0], [x1, y1]] = geoBounds(f);
      return !(x1 < tl[0] - 5 || x0 > br[0] + 5 || y1 < br[1] - 5 || y0 > tl[1] + 5) || x1 - x0 > 180;
    });
    return {
      projection,
      countries: visible.map((f) => ({ id: String(f.id), name: f.properties?.name, d: path(f) ?? "", own: highlight.includes(String(f.id)), c: path.centroid(f) })),
      graticule: path(geoGraticule10()) ?? "",
    };
  }, [topo, width, height, JSON.stringify(highlight), JSON.stringify(focus), JSON.stringify(center), JSON.stringify(points.map((p: MapPoint) => [p.lat, p.lon]))]);

  const pick = (e: GestureResponderEvent) => {
    if (!onPick || !geo) return;
    const { locationX, locationY } = e.nativeEvent as any;
    const ll = geo.projection.invert!([locationX, locationY]);
    if (ll) onPick({ lon: Math.round(ll[0] * 100) / 100, lat: Math.round(ll[1] * 100) / 100 });
  };

  if (!geo) {
    return <View style={{ width, height, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.faint, fontFamily: F.mono, fontSize: 11 }}>Chargement des frontières…</Text></View>;
  }
  const home = variant === "home";
  const content = (
    <Svg width={width} height={height}>
      <Path d={geo.graticule} stroke={C.line} strokeWidth={0.5} fill="none" opacity={home ? 0.35 : 0.55} />
      <G>
        {geo.countries.map((c: any) => (
          <Path key={c.id + c.d.length} d={c.d} fill={c.own ? (home ? "#132232" : C.landHi) : C.land} stroke={c.own ? (home ? C.steel : C.brass) : C.lineHi}
            strokeWidth={c.own ? (home ? 1.3 : 1.1) : 0.5} opacity={home && !c.own ? 0.45 : 1} />
        ))}
      </G>
      {points.filter((p: MapPoint) => p.lat != null && p.lon != null).map((p: MapPoint, i: number) => {
        const xy = geo.projection([p.lon!, p.lat!]);
        if (!xy) return null;
        const color = p.color ?? (p.kind === "zone" ? C.red : p.kind === "city" ? C.steel : C.brass);
        return (
          <G key={i}>
            {p.kind === "zone" || p.kind === "pick" ? (
              <Polygon points={`${xy[0]},${xy[1] - 7} ${xy[0] + 7},${xy[1]} ${xy[0]},${xy[1] + 7} ${xy[0] - 7},${xy[1]}`} fill={`${color}55`} stroke={color} strokeWidth={1.2} />
            ) : (
              <>
                <Circle cx={xy[0]} cy={xy[1]} r={p.kind === "event" ? 5 : 2.6} fill={color} opacity={0.9} />
                {p.kind === "event" ? <Circle cx={xy[0]} cy={xy[1]} r={10} stroke={color} strokeWidth={0.8} fill="none" opacity={0.6} /> : null}
              </>
            )}
            {showLabels && p.label ? (
              <SvgText x={xy[0] + 10} y={xy[1] + 4} fill={C.text} fontSize={10} fontFamily={F.mono} opacity={0.85}>{p.label}</SvgText>
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
  return (
    <View style={{ width, height }}>
      {onPick ? <Pressable onPress={pick} accessibilityLabel="Sélectionner un point sur la carte">{content}</Pressable> : content}
      {warning ? (
        <Text style={{ position: "absolute", left: 8, bottom: 6, right: 8, color: C.amber, fontFamily: F.mono, fontSize: 9.5 }} numberOfLines={2}>⚠ {warning}</Text>
      ) : null}
    </View>
  );
}

function FictionalMap({ width, height, regions, highlight, points, onPick }: any) {
  const sx = (x: number) => 30 + (x / 100) * (width - 60);
  const sy = (y: number) => 30 + (y / 100) * (height - 60);
  const pick = (e: GestureResponderEvent) => {
    if (!onPick) return;
    const { locationX, locationY } = e.nativeEvent as any;
    onPick({ x: Math.round(((locationX - 30) / (width - 60)) * 1000) / 10, y: Math.round(((locationY - 30) / (height - 60)) * 1000) / 10 });
  };
  const content = (
    <Svg width={width} height={height}>
      {Array.from({ length: 9 }).map((_, i) => (
        <Line key={`h${i}`} x1={0} x2={width} y1={(i * height) / 8} y2={(i * height) / 8} stroke={C.line} strokeWidth={0.5} opacity={0.5} />
      ))}
      {regions.map((r: any, i: number) =>
        regions.slice(i + 1).map((o: any) => (
          <Line key={`${r.id}-${o.id}`} x1={sx(r.x)} y1={sy(r.y)} x2={sx(o.x)} y2={sy(o.y)} stroke={C.line} strokeWidth={0.6} opacity={0.35} />
        )),
      )}
      {regions.map((r: any) => {
        const own = highlight.includes(r.id);
        return (
          <G key={r.id}>
            <Circle cx={sx(r.x)} cy={sy(r.y)} r={own ? 26 : 18} fill={own ? `${C.brass}22` : `${C.steel}14`} stroke={own ? C.brass : C.steelDim} strokeWidth={own ? 1.4 : 1} />
            <Circle cx={sx(r.x)} cy={sy(r.y)} r={3} fill={own ? C.brass : C.steel} />
            <SvgText x={sx(r.x)} y={sy(r.y) + (own ? 40 : 32)} fill={C.text} fontSize={10.5} fontFamily={F.mono} textAnchor="middle" opacity={0.85}>{r.name.length > 26 ? r.name.slice(0, 25) + "…" : r.name}</SvgText>
          </G>
        );
      })}
      {points.filter((p: MapPoint) => p.x != null && p.y != null).map((p: MapPoint, i: number) => (
        <G key={`p${i}`}>
          <Polygon points={`${sx(p.x!)},${sy(p.y!) - 7} ${sx(p.x!) + 7},${sy(p.y!)} ${sx(p.x!)},${sy(p.y!) + 7} ${sx(p.x!) - 7},${sy(p.y!)}`} fill={`${p.color ?? C.red}55`} stroke={p.color ?? C.red} />
          {p.label ? <SvgText x={sx(p.x!) + 10} y={sy(p.y!) + 4} fill={C.text} fontSize={10} fontFamily={F.mono}>{p.label}</SvgText> : null}
        </G>
      ))}
    </Svg>
  );
  return (
    <View style={{ width, height }}>
      {onPick ? <Pressable onPress={pick}>{content}</Pressable> : content}
      <Text style={{ position: "absolute", left: 8, bottom: 6, color: C.faint, fontFamily: F.mono, fontSize: 9.5 }}>Carte schématique générée — pas une donnée géographique réelle</Text>
    </View>
  );
}
