import { Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { Curve } from "./Curve";
import { Label, useLayout } from "./ui";
import { C, CARD_STYLE, F, S } from "../theme";

function Card({ title, text, tag, color, children, w }: { title: string; text: string; tag: string; color: string; children: React.ReactNode; w: number }) {
  return (
    <View style={{ width: w, backgroundColor: "#0B1117E6", borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
      <View style={{ height: 112, backgroundColor: "#070B10", alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: C.line }}>{children}</View>
      <View style={{ height: 2, backgroundColor: color, opacity: 0.8, marginTop: -1 }} />
      <View style={{ padding: S(4), gap: 6 }}>
        <Label color={color}>{tag}</Label>
        <Text style={{ fontFamily: F.title, fontSize: 22, color: C.text }}>{title}</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 20, color: C.muted }}>{text}</Text>
      </View>
    </View>
  );
}

/** Présentation des fonctionnalités : chaque carte porte une vignette animée (courbes qui se dessinent). */
export function Features() {
  const { width } = useLayout();
  const inner = Math.min(width, 1180) - S(8);
  const cols = inner > 900 ? 3 : inner > 560 ? 2 : 1;
  const w = Math.floor((inner - (cols - 1) * S(4)) / cols);
  const cw = Math.min(w - 24, 260);
  return (
    <View style={{ gap: S(5) }}>
      <View style={{ gap: 6 }}>
        <Label color={C.brass}>Ce que vous allez vivre</Label>
        <Text style={{ fontFamily: F.title, fontSize: 34, color: C.text }}>Un monde qui réagit à chaque décision.</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(4) }}>
        <Card w={w} tag="Rapport de force" color={C.steel} title="Des équilibres qui basculent" text="Deux camps, une courbe cachée : quand l'un domine trop, le monde produit un événement de rupture.">
          <Curve width={cw} height={96} series={[{ values: [48, 50, 47, 55, 52, 61, 66, 72], color: C.steel }, { values: [52, 50, 53, 45, 48, 39, 34, 28], color: C.red }]} />
        </Card>
        <Card w={w} tag="Renseignement imparfait" color={CARD_STYLE.targeted_intel.color} title="Fiabilité, pas certitude" text="75 % de fiabilité peut rester « Crédible » : une source peut être fragile, ou compromise.">
          <Svg width={cw} height={96} viewBox="0 0 260 96">
            <Path d="M10 88 C60 88 80 10 130 10 S200 88 250 88" stroke={CARD_STYLE.targeted_intel.color} strokeWidth="2" fill="none" />
            <Path d="M10 88 C60 88 80 10 130 10 S200 88 250 88 Z" fill={CARD_STYLE.targeted_intel.color} opacity={0.16} />
            <Line x1="170" y1="14" x2="170" y2="88" stroke={C.text} strokeWidth="1" strokeDasharray="3 4" />
            <Circle cx="170" cy="56" r="4" fill={C.text} />
          </Svg>
        </Card>
        <Card w={w} tag="Cartes stratégiques" color={CARD_STYLE.political_shock.color} title="Cinq dossiers, un seul usage" text="Renseignement, interception, guerre de l'information, nouveau front, choc politique.">
          <View style={{ flexDirection: "row", gap: 6 }}>
            {Object.values(CARD_STYLE).map((s, i) => (
              <View key={s.code} style={{ width: 38, height: 70, borderWidth: 1, borderColor: s.color, backgroundColor: `${s.color}22`, transform: [{ rotate: `${(i - 2) * 5}deg` }, { translateY: Math.abs(i - 2) * 3 }], alignItems: "center", paddingTop: 6 }}>
                <Text style={{ color: s.color, fontSize: 16 }}>{s.glyph}</Text>
                <Text style={{ color: s.color, fontFamily: F.monoBold, fontSize: 8, marginTop: 4 }}>{s.code}</Text>
              </View>
            ))}
          </View>
        </Card>
        <Card w={w} tag="Communiqués de Rome" color={C.red} title="Quand tout s'interrompt" text="Une enveloppe URGENT, une alerte sonore, un événement qui change les règles du jeu pour tous.">
          <View style={{ borderWidth: 2, borderColor: C.red, paddingHorizontal: 16, paddingVertical: 6, transform: [{ rotate: "-5deg" }] }}>
            <Text style={{ fontFamily: F.monoBold, color: C.red, letterSpacing: 6, fontSize: 24 }}>URGENT</Text>
          </View>
        </Card>
        <Card w={w} tag="Président de séance" color={C.brass} title="Arbitrer sans tout savoir" text="Il fixe une probabilité, jamais le résultat : même lui peut être surpris par le moteur.">
          <Svg width={cw} height={96} viewBox="0 0 260 96">
            <Path d="M50 84 A80 80 0 0 1 210 84" stroke={C.lineHi} strokeWidth="6" fill="none" />
            <Path d="M50 84 A80 80 0 0 1 150 20" stroke={C.brass} strokeWidth="6" fill="none" />
            <Line x1="130" y1="84" x2="164" y2="34" stroke={C.text} strokeWidth="2" /><Circle cx="130" cy="84" r="5" fill={C.text} />
          </Svg>
        </Card>
        <Card w={w} tag="Mémoire des engagements" color={C.green} title="Une promesse n'est jamais oubliée" text="Un engagement tenu bâtit la confiance ; un engagement rompu la détruit, des rounds plus tard.">
          <Curve width={cw} height={96} series={[{ values: [10, 24, 36, 48, 60, 30, 18, 34, 52], color: C.green }]} grid={false} />
        </Card>
      </View>
    </View>
  );
}
