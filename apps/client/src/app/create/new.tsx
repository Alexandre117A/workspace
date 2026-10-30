import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SessionParams } from "../../components/SessionParams";
import { Body, Btn, Field, H1, Label, Loading, Notice, Screen } from "../../components/ui";
import { api } from "../../lib/api";
import { useRequireAuth } from "../../lib/hooks";
import { C, F, S } from "../../theme";

type Step = "name" | "describe" | "questions" | "params";
interface QA { question: string; answer: string; theme?: string }

export default function NewSimulation() {
  const user = useRequireAuth("/create/new");
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<QA[]>([]);
  const [current, setCurrent] = useState<{ question: string; hint?: string; theme?: string; generated_by?: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [teams, setTeams] = useState(4);
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Chaque question tient compte de la description et de toutes les réponses précédentes. */
  const askNext = async (list: QA[]) => {
    setBusy(true);
    setError(null);
    try {
      const q = await api("/scenarios/questions", { body: { name, description, answers: list } });
      if (q.done) {
        setCurrent(null);
        setStep("params");
      } else {
        setCurrent(q);
        setAnswer("");
        setStep("questions");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async () => {
    if (!current || answer.trim().length < 2) return setError("Répondez en quelques mots.");
    const list = [...answers, { question: current.question, answer: answer.trim(), theme: current.theme }];
    setAnswers(list);
    await askNext(list);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ jobId: string }>("/scenarios/jobs", { body: { mode: "fictional", prompt: description, name, answers, players: teams } });
      router.replace({ pathname: "/prepare/[jobId]", params: { jobId: r.jobId, teams: String(teams), duration: String(duration) } });
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!user) return null;
  const stepIndex = { name: 1, describe: 2, questions: 3, params: 4 }[step];
  return (
    <Screen max={860}>
      <View style={{ gap: S(6) }}>
        <Pressable onPress={() => router.back()}><Label>← Vos simulations</Label></Pressable>
        <View style={{ flexDirection: "row", gap: S(2) }}>
          {[1, 2, 3, 4].map((i) => <View key={i} style={{ flex: 1, height: 2, backgroundColor: i <= stepIndex ? C.red : C.line }} />)}
        </View>

        {step === "name" ? (
          <View style={{ gap: S(5) }}>
            <Label color={C.red}>Étape 1 · Nom</Label>
            <H1>Comment s'appelle cette simulation ?</H1>
            <Field value={name} onChangeText={setName} placeholder="Ex. La Guerre des Sept Lunes" maxLength={120} autoFocus
              style={{ fontFamily: F.title, fontSize: 26, minHeight: 60 }} onSubmitEditing={() => name.trim().length >= 2 && setStep("describe")} />
            <Btn label="Continuer" disabled={name.trim().length < 2} onPress={() => setStep("describe")} accent={C.red} />
          </View>
        ) : null}

        {step === "describe" ? (
          <View style={{ gap: S(5) }}>
            <Label color={C.red}>Étape 2 · L'univers</Label>
            <H1>{name}</H1>
            <Field big value={description} onChangeText={setDescription} maxLength={6000}
              placeholder="Décrivez précisément le monde, la situation et les événements que vous souhaitez simuler."
              style={{ minHeight: 260 }} accessibilityLabel="Description de l'univers" />
            <Body muted style={{ fontSize: 13 }}>Pays réels ou fictifs, coalitions, empires, organisations, civilisations, planètes, galaxies : aucun cadre n'est imposé.</Body>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Btn label="Continuer" disabled={description.trim().length < 20} busy={busy} onPress={() => askNext([])} accent={C.red} />
          </View>
        ) : null}

        {step === "questions" ? (
          <View style={{ gap: S(5) }}>
            <Label color={C.red}>Étape 3 · Précisions — question {answers.length + 1}</Label>
            {busy && !current ? <Loading label="Analyse de votre univers" /> : null}
            {current ? (
              <>
                <Text style={{ fontFamily: F.title, fontSize: 28, color: C.text, lineHeight: 34 }}>{current.question}</Text>
                <Field big value={answer} onChangeText={setAnswer} placeholder={current.hint || "Votre réponse"} style={{ minHeight: 140 }} />
                <Label color={C.faint}>{current.generated_by?.startsWith("ai") ? "Question générée par l'IA à partir de vos réponses" : "Question choisie par les règles du moteur à partir de vos réponses (IA non configurée)"}</Label>
              </>
            ) : null}
            {answers.length ? (
              <View style={{ gap: S(2) }}>
                {answers.map((a, i) => <Body key={i} muted style={{ fontSize: 13 }}>Q{i + 1}. {a.question} — <Text style={{ color: C.text }}>{a.answer}</Text></Body>)}
              </View>
            ) : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Btn label="Valider la réponse" onPress={submitAnswer} busy={busy} accent={C.red} />
          </View>
        ) : null}

        {step === "params" ? (
          <View style={{ gap: S(5) }}>
            <Label color={C.red}>Étape 4 · Participants et durée</Label>
            <H1>{name}</H1>
            <SessionParams teams={teams} duration={duration} onTeams={setTeams} onDuration={setDuration} />
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Btn label="Créer la simulation" onPress={create} busy={busy} accent={C.red} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
