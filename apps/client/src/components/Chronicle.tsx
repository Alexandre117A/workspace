import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Line, LinearGradient, Pattern, Rect, Stop, Text as SvgText } from "react-native-svg";
import { useLayout, useReducedMotion } from "./ui";
import { PHOTOS, Photo } from "../content/photos";
import { C, F } from "../theme";

/**
 * « Chronique » : une MOSAÏQUE dense de photographies d'archives qui défile du haut vers le bas.
 * Les photos se touchent et se fondent les unes dans les autres (aucune frontière) ; un seul traitement
 * colorimétrique recouvre l'ensemble pour donner l'impression d'une seule et même image.
 * Aucun visuel dessiné ni généré. Chaque visite tire un ordre, des recadrages et un traitement différents.
 */
const VISIT = Math.floor(Math.random() * 2 ** 31);

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADES = [
  "grayscale(1) contrast(1.2) brightness(1.02)",
  "sepia(0.85) contrast(1.12) brightness(1.05)",
  "grayscale(0.9) sepia(0.2) contrast(1.25)",
  "grayscale(1) contrast(1.35) brightness(0.96)",
];
const PER_COL = 8;

interface Tile extends Photo {
  zoom: number;
  fx: number; // recadrage : décalage horizontal (0..1)
  fy: number; // recadrage : décalage vertical (0..1)
  caption: boolean;
}

/** Chaque colonne tire sa propre suite de photos, avec des recadrages différents (une même photo ne se reconnaît pas). */
function makeColumns(cols: number): Tile[][] {
  if (!PHOTOS.length) return [];
  const r = rng(VISIT);
  return Array.from({ length: cols }, (_, c) => {
    const pool = [...PHOTOS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const seq: Photo[] = [];
    while (seq.length < PER_COL) seq.push(...pool);
    return seq.slice(0, PER_COL).map((p, i) => ({ ...p, zoom: 1.15 + r() * 0.55, fx: r(), fy: r(), caption: (i + c) % 3 === 0 }));
  });
}

/** Sur le web, le bord de chaque tuile s'efface réellement (masque) : elle se fond dans ses voisines au lieu de s'assombrir. */
const FADE_MASK: any = Platform.OS === "web" ? (() => {
  const m = "linear-gradient(to right, transparent 0%, #000 24%, #000 76%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 30%, #000 70%, transparent 100%)";
  return { maskImage: m, WebkitMaskImage: m, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
})() : {};

function TileView({ t, w, h, left, top, uid }: { t: Tile; w: number; h: number; left: number; top: number; uid: string }) {
  // L'image est agrandie puis recadrée à un endroit différent : fondu horizontal et vertical sur les bords.
  const iw = w * t.zoom, ih = h * t.zoom;
  return (
    <View style={[{ position: "absolute", left, top, width: w, height: h, overflow: "hidden" }, FADE_MASK]}>
      <Animated.Image source={t.src} resizeMode="cover" style={{ position: "absolute", width: iw, height: ih, left: -(iw - w) * t.fx, top: -(ih - h) * t.fy }} />
      {Platform.OS === "web" ? null : <Svg style={StyleSheet.absoluteFill} width={w} height={h}>
        <Defs>
          <LinearGradient id={`tv${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0B1420" stopOpacity="0.95" /><Stop offset="0.28" stopColor="#0B1420" stopOpacity="0" />
            <Stop offset="0.72" stopColor="#0B1420" stopOpacity="0" /><Stop offset="1" stopColor="#0B1420" stopOpacity="0.95" />
          </LinearGradient>
          <LinearGradient id={`th${uid}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#0B1420" stopOpacity="0.9" /><Stop offset="0.24" stopColor="#0B1420" stopOpacity="0" />
            <Stop offset="0.76" stopColor="#0B1420" stopOpacity="0" /><Stop offset="1" stopColor="#0B1420" stopOpacity="0.9" />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={h} fill={`url(#th${uid})`} /><Rect width={w} height={h} fill={`url(#tv${uid})`} />
      </Svg>}
      {t.caption && t.label ? (
        <View style={{ position: "absolute", bottom: h * 0.2, left: w * 0.14, right: w * 0.1 }}>
          {t.year ? <Text style={{ fontFamily: F.monoBold, fontSize: 9.5, letterSpacing: 2.5, color: "#D9CDB2" }}>{t.year}</Text> : null}
          <Text numberOfLines={2} style={{ fontFamily: F.title, fontSize: 14, color: "#EDE6D4" }}>{t.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Quadrillage d'atlas fixe : méridiens et parallèles très fins, graduations en bordure. Il se fond dans les photographies et les cartes anciennes. */
function AtlasGrid({ w, h }: { w: number; h: number }) {
  const STEP = 140;
  const lats = Array.from({ length: Math.ceil(h / STEP) }, (_, i) => i);
  const lons = Array.from({ length: Math.ceil(w / STEP) }, (_, i) => i);
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <Pattern id="atlasgrid" width={STEP} height={STEP} patternUnits="userSpaceOnUse">
          <Line x1="0" y1="0.5" x2={STEP} y2="0.5" stroke="#9CC0E3" strokeWidth={0.6} opacity={0.22} />
          <Line x1="0.5" y1="0" x2="0.5" y2={STEP} stroke="#9CC0E3" strokeWidth={0.6} opacity={0.22} />
          <Line x1="0" y1={STEP / 2} x2={STEP} y2={STEP / 2} stroke="#9CC0E3" strokeWidth={0.4} strokeDasharray="2,6" opacity={0.18} />
          <Line x1={STEP / 2} y1="0" x2={STEP / 2} y2={STEP} stroke="#9CC0E3" strokeWidth={0.4} strokeDasharray="2,6" opacity={0.18} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#atlasgrid)" />
      {lats.map((i) => i > 0 ? <SvgText key={`a${i}`} x={6} y={i * STEP - 4} fontSize={8.5} fontFamily={F.mono} fill="#CFE0F2" opacity={0.4}>{70 - i * 5}°N</SvgText> : null)}
      {lons.map((i) => i > 0 ? <SvgText key={`o${i}`} x={i * STEP + 4} y={11} fontSize={8.5} fontFamily={F.mono} fill="#CFE0F2" opacity={0.4}>{-30 + i * 10}°{-30 + i * 10 >= 0 ? "E" : "O"}</SvgText> : null)}
    </Svg>
  );
}

/** Fond défilant. `strength` règle la visibilité (0.3 discret → 1 plein cadre). */
export function Chronicle({ strength = 0.85 }: { strength?: number }) {
  const { width, height } = useLayout();
  const reduced = useReducedMotion();
  const w = Math.max(320, Math.round(width));
  const cols = Math.max(2, Math.round(w / 280));
  const colW = w / cols;
  const bandH = Math.round(colW * 1.55);
  const step = Math.round(bandH * 0.66); // recouvrement vertical → fondu continu
  const T = PER_COL * step;
  const columns = useMemo(() => makeColumns(cols), [cols]);
  const grade = useMemo(() => GRADES[Math.floor(rng(VISIT ^ 0x9e37)() * GRADES.length)], []);
  const scroll = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced || !columns.length) return;
    const start = Math.random(); // point de départ différent à chaque visite
    scroll.setValue(start);
    const per = (T / 24) * 1000;
    Animated.timing(scroll, { toValue: 1, duration: (1 - start) * per, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      scroll.setValue(0);
      Animated.loop(Animated.timing(scroll, { toValue: 1, duration: per, easing: Easing.linear, useNativeDriver: true })).start();
    });
    const f = Animated.loop(Animated.sequence([
      Animated.delay(1100), Animated.timing(flicker, { toValue: 0.08, duration: 90, useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 0.02, duration: 140, useNativeDriver: true }), Animated.timing(flicker, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]));
    f.start();
    return () => { scroll.stopAnimation(); f.stop(); };
  }, [reduced, columns.length, T]);
  const y = scroll.interpolate({ inputRange: [0, 1], outputRange: [-T, 0] });
  if (!columns.length) return null;
  const web: any = { filter: grade };
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: strength, overflow: "hidden" }]} pointerEvents="none">
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: w, height: 2 * T + bandH, transform: [{ translateY: reduced ? -T * 0.3 : y }] }, web]}>
        {[0, 1].map((k) => columns.map((col, c) => col.map((t, i) => {
          // Les tuiles débordent d'un quart sur les voisines : le fondu des bords fait disparaître les frontières.
          const tw = colW * 1.5;
          return <TileView key={`${k}-${c}-${i}`} uid={`${k}${c}${i}`} t={t} w={tw} h={bandH} left={c * colW - colW * 0.25} top={k * T + i * step + ((c % 2) * step) / 2} />;
        })))}
      </Animated.View>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs><Pattern id="grain" width="5" height="5" patternUnits="userSpaceOnUse"><Rect width="1" height="1" fill="#fff" opacity={0.1} /><Rect x="3" y="2" width="1" height="1" fill="#fff" opacity={0.07} /></Pattern></Defs>
        <Rect width="100%" height="100%" fill="url(#grain)" />
      </Svg>
      <AtlasGrid w={w} h={Math.round(height)} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: flicker }]} />
    </View>
  );
}

/** Voile dégradé et vignette : garde les textes lisibles et fond les bords dans le décor. */
export function ChronicleVeil() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bg} stopOpacity="0.62" />
          <Stop offset="0.4" stopColor={C.bg} stopOpacity="0.5" />
          <Stop offset="1" stopColor={C.bg} stopOpacity="0.75" />
        </LinearGradient>
        <LinearGradient id="side" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.bg} stopOpacity="0.4" /><Stop offset="0.2" stopColor={C.bg} stopOpacity="0" />
          <Stop offset="0.8" stopColor={C.bg} stopOpacity="0" /><Stop offset="1" stopColor={C.bg} stopOpacity="0.4" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#veil)" />
      <Rect width="100%" height="100%" fill="url(#side)" />
    </Svg>
  );
}
