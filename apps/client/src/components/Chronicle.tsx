import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Pattern, Rect, Stop } from "react-native-svg";
import { useLayout, useReducedMotion } from "./ui";
import { PHOTOS, Photo } from "../content/photos";
import { C, F } from "../theme";

/**
 * « Chronique » : un seul plan continu de PHOTOGRAPHIES d'archives qui défile du haut vers le bas.
 * Les images se fondent les unes dans les autres (aucune frontière), avec un léger mouvement de caméra,
 * du grain et un scintillement de projecteur. Aucun visuel dessiné ni généré.
 * Chaque visite tire un ordre, des traitements (noir et blanc, sépia, contraste) et un point de départ différents.
 */
const VISIT = Math.floor(Math.random() * 2 ** 31); // un tirage par visite (chargement de la page)

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TREATMENTS = [
  "grayscale(1) contrast(1.18) brightness(1.02)",
  "sepia(0.9) contrast(1.12) brightness(1.05)",
  "grayscale(1) contrast(1.35) brightness(0.95)",
  "grayscale(0.85) sepia(0.25) contrast(1.2)",
];

const STEP = 300; // pas vertical entre deux photos
const BAND = 460; // hauteur d'une photo : le recouvrement (BAND − STEP) crée le fondu continu

interface Band extends Photo {
  filter: string;
  side: "left" | "right";
  drift: number;
  zoom: number;
}

function makeBands(): Band[] {
  if (!PHOTOS.length) return [];
  const r = rng(VISIT);
  const pool = [...PHOTOS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: Photo[] = [];
  while (out.length < 8) out.push(...pool);
  return out.slice(0, Math.max(8, pool.length)).map((p) => ({
    ...p,
    filter: TREATMENTS[Math.floor(r() * TREATMENTS.length)],
    side: r() < 0.5 ? "left" : "right",
    drift: (r() < 0.5 ? -1 : 1) * (14 + r() * 26),
    zoom: 1.08 + r() * 0.08,
  }));
}

function PhotoBand({ b, w, top, drift }: { b: Band; w: number; top: number; drift: Animated.Value }) {
  const tx = drift.interpolate({ inputRange: [0, 1], outputRange: [-b.drift, b.drift] });
  const web: any = { filter: b.filter };
  return (
    <View style={{ position: "absolute", left: 0, top, width: w, height: BAND, overflow: "hidden" }}>
      <Animated.Image source={b.src} resizeMode="cover" style={[{ position: "absolute", left: -w * 0.06, width: w * b.zoom, height: BAND, transform: [{ translateX: tx }] }, web]} />
      <Svg style={StyleSheet.absoluteFill} width={w} height={BAND}>
        <Defs>
          <LinearGradient id="bf" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0A0D12" stopOpacity="1" /><Stop offset="0.3" stopColor="#0A0D12" stopOpacity="0" />
            <Stop offset="0.7" stopColor="#0A0D12" stopOpacity="0" /><Stop offset="1" stopColor="#0A0D12" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={BAND} fill="url(#bf)" />
      </Svg>
      {b.label ? (
        <View style={{ position: "absolute", bottom: 96, [b.side]: w * 0.05, alignItems: b.side === "left" ? "flex-start" : "flex-end" } as any}>
          {b.year ? <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 3, color: "#D9CDB2" }}>{b.year}</Text> : null}
          <Text style={{ fontFamily: F.title, fontSize: 17, color: "#EDE6D4" }}>{b.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Fond défilant. `strength` règle la visibilité (0.3 discret → 1 plein cadre). */
export function Chronicle({ strength = 0.85 }: { strength?: number }) {
  const { width } = useLayout();
  const reduced = useReducedMotion();
  const bands = useMemo(makeBands, []);
  const scroll = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(0)).current;
  const w = Math.max(320, Math.round(width));
  const T = Math.max(bands.length, 1) * STEP;
  useEffect(() => {
    if (reduced || !bands.length) return;
    const start = Math.random(); // point de départ différent à chaque visite
    scroll.setValue(start);
    const per = (T / 22) * 1000;
    Animated.timing(scroll, { toValue: 1, duration: (1 - start) * per, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      scroll.setValue(0);
      Animated.loop(Animated.timing(scroll, { toValue: 1, duration: per, easing: Easing.linear, useNativeDriver: true })).start();
    });
    const d = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 26000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 26000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const f = Animated.loop(Animated.sequence([
      Animated.delay(900), Animated.timing(flicker, { toValue: 0.09, duration: 90, useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 0.02, duration: 140, useNativeDriver: true }), Animated.timing(flicker, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]));
    d.start();
    f.start();
    return () => { scroll.stopAnimation(); d.stop(); f.stop(); };
  }, [reduced, bands.length, T]);
  const y = scroll.interpolate({ inputRange: [0, 1], outputRange: [-T, 0] });
  if (!bands.length) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: strength, overflow: "hidden" }]} pointerEvents="none">
      <Animated.View style={{ position: "absolute", left: 0, top: 0, width: w, height: 2 * T + BAND, transform: [{ translateY: reduced ? -T * 0.3 : y }] }}>
        {[0, 1].map((k) => bands.map((b, i) => <PhotoBand key={`${k}-${i}`} b={b} w={w} top={k * T + i * STEP} drift={drift} />))}
      </Animated.View>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs><Pattern id="grain" width="5" height="5" patternUnits="userSpaceOnUse"><Rect width="1" height="1" fill="#fff" opacity={0.1} /><Rect x="3" y="2" width="1" height="1" fill="#fff" opacity={0.07} /></Pattern></Defs>
        <Rect width="100%" height="100%" fill="url(#grain)" />
      </Svg>
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
          <Stop offset="0" stopColor={C.bg} stopOpacity="0.55" />
          <Stop offset="0.4" stopColor={C.bg} stopOpacity="0.3" />
          <Stop offset="1" stopColor={C.bg} stopOpacity="0.75" />
        </LinearGradient>
        <LinearGradient id="side" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.bg} stopOpacity="0.4" /><Stop offset="0.25" stopColor={C.bg} stopOpacity="0" />
          <Stop offset="0.75" stopColor={C.bg} stopOpacity="0" /><Stop offset="1" stopColor={C.bg} stopOpacity="0.4" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#veil)" />
      <Rect width="100%" height="100%" fill="url(#side)" />
    </Svg>
  );
}
