import { Text, View } from "react-native";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { PageScreen, Paper } from "../components/Page";
import { useLayout } from "../components/ui";
import { ProvenanceChip } from "../atlas/parts";
import { Provenance } from "../atlas/provenance";
import { C, F, S } from "../theme";

const KINDS: { status: Provenance; title: string; text: string }[] = [
  { status: "confirmed", title: "Faits documentés", text: "Événements, dates et informations historiques fondés sur des sources identifiables. Dans GEONEX, ils portent la mention « Attesté »." },
  { status: "estimate", title: "Estimations", text: "Informations approximatives ou reconstruites, notamment lorsque les données historiques sont incomplètes : ordres de grandeur de population, d'économie, de forces. Mention « Estimation »." },
  { status: "hypothesis", title: "Hypothèses de simulation", text: "Conditions initiales choisies pour rendre un scénario jouable ou explorer une situation particulière, et unités de jeu propres à GEONEX. Mention « Hypothèse »." },
  { status: "simulation", title: "Événements simulés", text: "Développements résultant des décisions des joueurs et du moteur de simulation. Un événement simulé n'est jamais présenté comme un événement historique réel. Mention « Simulation »." },
];

const SOURCES: [string, string][] = [
  ["Géographie", "Natural Earth (domaine public) pour les côtes et les frontières actuelles. Aucun jeu de frontières d'époque n'est intégré : avant la guerre froide, la carte montre seulement les côtes."],
  ["Bases historiques", "Trois reconstitutions GEONEX (crise des missiles de Cuba, 1962 ; campagne d'Égypte, 1799 ; guerre de Cent Ans, 1415), établies à partir de connaissances encyclopédiques. Des liens Wikipédia sont fournis dans les dossiers pour vérification. Les faits notés « Attesté » sont des faits établis ; les quantités sont des estimations."],
  ["Données contemporaines", "Une table de référence interne (population, économie, dépenses militaires, en ordres de grandeur), signalée comme estimation. Lorsque l'hébergeur l'active, une recherche en ligne (Wikipédia, Wikidata) complète la situation, avec la date de consultation."],
  ["Images et drapeaux", "Photographies et cartes anciennes de la NASA (domaine public) et de Wikimedia Commons (licences libres, auteurs crédités), drapeaux de flagcdn. Le détail figure dans la page « Crédits des images »."],
];

/** MÉTHODOLOGIE & FIABILITÉ : la philosophie intellectuelle de la plateforme, sans rien affirmer qui ne soit vérifiable. */
export default function Methodology() {
  const { phone, desktop } = useLayout();
  const h2 = (t: string) => <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 27 : 33, color: C.ink }}>{t}</Text>;
  const p = (t: string, extra?: any) => <Text style={[{ fontFamily: F.sans, fontSize: 16, lineHeight: 26, color: C.ink }, extra]}>{t}</Text>;
  return (
    <PageScreen max={1000}>
      <View style={{ gap: S(3), marginBottom: S(6), maxWidth: 860 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2.6, color: C.brass, textTransform: "uppercase" }}>Méthodologie & fiabilité</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.title, fontSize: phone ? 36 : 54, lineHeight: phone ? 40 : 58, color: C.text, textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>Comprendre le monde exige d'en explorer les décisions.</Text>
        <Text style={{ fontFamily: F.titleItalic, fontSize: phone ? 18 : 21, lineHeight: phone ? 27 : 31, color: "#D9D4C6", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 7, textShadowOffset: { width: 0, height: 1 } }}>
          GEONEX repose sur une conviction : les événements historiques et les crises géopolitiques ne peuvent être pleinement compris sans examiner les décisions, les contraintes et les rapports de force qui les façonnent. À travers la simulation, les participants sont invités à confronter leurs stratégies, à interpréter des acteurs et à observer les conséquences possibles de leurs choix. Notre ambition est d'associer immersion, rigueur historique et réflexion stratégique dans un environnement accessible.
        </Text>
      </View>

      <Paper style={{ padding: S(phone ? 5 : 8), gap: S(5) }}>
        {h2("Quatre sortes d'informations, toujours distinguées")}
        {p("Chaque valeur affichée dans une partie indique sa nature. Cette distinction est la règle centrale de GEONEX : un chiffre ou un événement ne change jamais de statut pour paraître plus solide.")}
        <View style={{ flexDirection: desktop ? "row" : "column", flexWrap: "wrap", gap: S(4) }}>
          {KINDS.map((k) => (
            <View key={k.status} style={{ flexBasis: desktop ? "47%" : "100%", flexGrow: 1, gap: S(2), borderLeftWidth: 3, borderLeftColor: C.brass, paddingLeft: S(4) }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 2, color: "#7A6428", textTransform: "uppercase" }}>{k.title}</Text>
              <ProvenanceChip status={k.status} light />
              {p(k.text, { fontSize: 15, lineHeight: 23 })}
            </View>
          ))}
        </View>
        {p("Deux mentions complètent ces quatre catégories : « Fictif » pour les mondes imaginaires, et « Donnée indisponible » quand le scénario ne fournit pas l'information : GEONEX préfère l'absence d'indicateur à un chiffre inventé.")}
      </Paper>

      <Paper style={{ padding: S(phone ? 5 : 8), gap: S(4), marginTop: S(5) }}>
        {h2("Sources et références")}
        {p("Voici les sources que GEONEX utilise réellement. Il ne s'agit pas d'une bibliographie savante : GEONEX n'affiche aucune citation, référence ou donnée qu'il n'a pas effectivement utilisée.")}
        {SOURCES.map(([t, x]) => (
          <View key={t} style={{ gap: 4, borderTopWidth: 1, borderTopColor: "#DDD6C5", paddingTop: S(3) }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 2, color: "#7A6428", textTransform: "uppercase" }}>{t}</Text>
            {p(x, { fontSize: 15, lineHeight: 23 })}
          </View>
        ))}
        <Pressable accessibilityRole="link" onPress={() => router.push("/credits")}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: C.atlas, textDecorationLine: "underline" }}>CRÉDITS DES IMAGES →</Text></Pressable>
      </Paper>

      <Paper style={{ padding: S(phone ? 5 : 8), gap: S(4), marginTop: S(5) }}>
        {h2("Les limites des simulations")}
        {["Une simulation n'est pas une reconstitution parfaite de la réalité.", "Les données historiques peuvent être incomplètes ou discutées.", "Les décisions humaines restent complexes : un moteur à règles n'en capture qu'une partie.", "Les résultats obtenus ne sont pas des prédictions certaines.", "Les scénarios alternatifs sont des exercices d'exploration stratégique, non des affirmations sur ce qui aurait pu être."].map((t) => (
          <View key={t} style={{ flexDirection: "row", gap: S(3) }}><Text style={{ color: C.brass, fontSize: 16 }}>◆</Text>{p(t, { flex: 1 })}</View>
        ))}
        {p("GEONEX ne prétend pas que ses scénarios sont scientifiquement validés ou historiquement exacts : aucun processus de validation académique n'est en place. Les scénarios proposés par la communauté ne sont pas validés historiquement par GEONEX ; ils sont relus uniquement pour vérifier qu'ils respectent les règles de publication.")}
      </Paper>

      <Paper style={{ padding: S(phone ? 5 : 8), gap: S(4), marginTop: S(5) }}>
        {h2("Développer l'esprit critique")}
        {p("GEONEX est un outil de réflexion. Il invite à :")}
        {["analyser les sources et en discuter la fiabilité ;", "comprendre les intérêts de chaque acteur, y compris ceux qu'il ne dit pas ;", "étudier les contraintes géographiques, que l'atlas rend visibles ;", "analyser les rapports de puissance et leur évolution ;", "comparer des stratégies et en argumenter le choix ;", "mesurer la complexité historique plutôt que la réduire à un récit unique."].map((t) => (
          <View key={t} style={{ flexDirection: "row", gap: S(3) }}><Text style={{ color: C.brass, fontSize: 16 }}>◆</Text>{p(t, { flex: 1 })}</View>
        ))}
        <View style={{ flexDirection: "row", gap: S(3), flexWrap: "wrap", paddingTop: S(2) }}>
          <Pressable accessibilityRole="link" onPress={() => router.push("/library")} style={({ hovered }: any) => ({ backgroundColor: hovered ? "#1B3A5E" : C.panel, paddingVertical: 12, paddingHorizontal: 18, borderBottomWidth: 3, borderBottomColor: C.brass })}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: "#fff" }}>EXPLORER LES SCÉNARIOS</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push("/docs")} style={{ paddingVertical: 12, paddingHorizontal: 18, borderWidth: 1, borderColor: C.atlas }}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: C.atlas }}>LIRE LE GUIDE</Text></Pressable>
        </View>
      </Paper>
    </PageScreen>
  );
}
