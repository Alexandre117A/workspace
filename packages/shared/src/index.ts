/**
 * Types, constantes et schémas partagés entre le client GEONEX et le backend.
 * Le serveur reste l'autorité : ces schémas servent à valider les entrées
 * côté serveur et à guider les formulaires côté client.
 */
import { z } from "zod";

export const APP_NAME = "GEONEX";

export const MIN_DURATION_MINUTES = 30;
export const RECOMMENDED_DURATION_MINUTES = 60;
export const DURATION_RECOMMENDATION =
  "Pour profiter pleinement du moteur de simulation, une durée d'au moins une heure est recommandée.";
export const BRIEFING_SECONDS = 45;
export const REACTION_SECONDS = 7;
export const CALL_MAX_SECONDS = 60;
export const INVITE_TIMEOUT_SECONDS = 20;
export const BALANCE_UNLOCK_ROUND = 3;
export const CARDS_FIRST_ROUND = 2;

export type Mode = "contemporary" | "historical" | "fictional";
export const MODES: Mode[] = ["contemporary", "historical", "fictional"];

export type SessionStatus = "preparing" | "lobby" | "dossier" | "running" | "finished" | "expired";
export type Phase =
  | "lobby"
  | "dossier"
  | "briefing"
  | "assembly"
  | "diplomacy"
  | "decisions"
  | "arbitration"
  | "resolution"
  | "consequences"
  | "final"
  | "ended";

export const PHASE_LABELS: Record<Phase, string> = {
  lobby: "Salon d'attente",
  dossier: "Dossiers confidentiels",
  briefing: "Briefing",
  assembly: "Assemblée publique",
  diplomacy: "Diplomatie",
  decisions: "Décisions",
  arbitration: "Arbitrage",
  resolution: "Résolution du moteur",
  consequences: "Conséquences",
  final: "Résolution finale",
  ended: "Simulation terminée",
};

export type ParticipantRole = "team" | "president";

export type CardKey = "targeted_intel" | "interception" | "information_warfare" | "new_front" | "political_shock";
export const CARD_LABELS: Record<CardKey, string> = {
  targeted_intel: "Renseignement ciblé",
  interception: "Interception",
  information_warfare: "Guerre de l'information",
  new_front: "Ouvrir un nouveau front",
  political_shock: "Choc politique",
};
export const CARD_ORDER: CardKey[] = ["targeted_intel", "interception", "political_shock", "information_warfare", "new_front"];

export type DecisionCategory =
  | "diplomatic_initiative"
  | "alliance"
  | "ceasefire_offer"
  | "sanctions"
  | "economic_aid"
  | "military_deployment"
  | "military_strike"
  | "defensive_posture"
  | "covert_operation"
  | "information_campaign"
  | "domestic_policy"
  | "humanitarian";

export const DECISION_LABELS: Record<DecisionCategory, string> = {
  diplomatic_initiative: "Initiative diplomatique",
  alliance: "Proposition d'alliance",
  ceasefire_offer: "Offre de cessez-le-feu / négociation",
  sanctions: "Sanctions économiques",
  economic_aid: "Aide économique / accord commercial",
  military_deployment: "Déploiement militaire",
  military_strike: "Frappe ou offensive militaire",
  defensive_posture: "Posture défensive",
  covert_operation: "Opération clandestine",
  information_campaign: "Campagne de communication",
  domestic_policy: "Mesures intérieures",
  humanitarian: "Action humanitaire",
};
export const DECISIONS_NEEDING_TARGET: DecisionCategory[] = [
  "diplomatic_initiative",
  "alliance",
  "ceasefire_offer",
  "sanctions",
  "economic_aid",
  "military_strike",
  "covert_operation",
];
export const DECISIONS_NEEDING_ARBITRATION: DecisionCategory[] = ["military_strike", "covert_operation"];
export const MAX_DECISIONS_PER_ROUND = 3;
export const MAX_ALLOCATION_PER_DECISION = 30;

export const RELIABILITY_LABELS = ["Très incertaine", "Fragile", "Plausible", "Crédible", "Haute confiance"] as const;

/** Codes d'invitation : 10 caractères (alphabet sans ambiguïté), affichés XXXXX-XXXXX. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 10;
export function normalizeJoinCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function formatJoinCode(code: string): string {
  const c = normalizeJoinCode(code);
  return c.length === JOIN_CODE_LENGTH ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}
export function isValidJoinCode(raw: string): boolean {
  const c = normalizeJoinCode(raw);
  return c.length === JOIN_CODE_LENGTH && [...c].every((ch) => JOIN_CODE_ALPHABET.includes(ch));
}

// ------------------------------------------------------------------ schémas d'entrée

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, "10 caractères minimum").max(200),
  displayName: z.string().trim().min(2).max(40).optional(),
});
export const guestSchema = z.object({ displayName: z.string().trim().min(2).max(40) });

export const scenarioJobSchema = z.object({
  mode: z.enum(["contemporary", "historical", "fictional"]),
  prompt: z.string().trim().min(3).max(6000),
  name: z.string().trim().max(120).optional().default(""),
  answers: z
    .array(z.object({ question: z.string().max(600), answer: z.string().max(2000), theme: z.string().max(40).optional() }))
    .max(5)
    .optional()
    .default([]),
  players: z.number().int().min(1).max(16),
});
export type ScenarioJobInput = z.infer<typeof scenarioJobSchema>;

export const questionSchema = z.object({
  name: z.string().max(120).optional().default(""),
  description: z.string().trim().min(10).max(6000),
  answers: z
    .array(z.object({ question: z.string(), answer: z.string(), theme: z.string().optional() }))
    .max(5)
    .default([]),
});

export const createSessionSchema = z.object({
  scenarioId: z.string().uuid(),
  teams: z.number().int().min(1).max(16),
  durationMinutes: z.number().int().min(MIN_DURATION_MINUTES).max(600),
  name: z.string().trim().max(120).optional(),
});

export const joinSessionSchema = z.object({ code: z.string().trim().min(6).max(20) });

export const decisionSchema = z.object({
  id: z.string().min(1).max(64),
  category: z.enum(Object.keys(DECISION_LABELS) as [DecisionCategory, ...DecisionCategory[]]),
  targets: z.array(z.string().max(12)).max(3).default([]),
  zone: z.string().max(12).nullable().optional(),
  intent: z.string().max(1200).default(""),
  allocation: z
    .object({
      political: z.number().min(0).max(MAX_ALLOCATION_PER_DECISION).default(0),
      economic: z.number().min(0).max(MAX_ALLOCATION_PER_DECISION).default(0),
      military: z.number().min(0).max(MAX_ALLOCATION_PER_DECISION).default(0),
    })
    .default({ political: 0, economic: 0, military: 0 }),
  resources: z.array(z.object({ key: z.string().max(40), quantity: z.number().positive().max(1e6) })).max(6).default([]),
  secret: z.boolean().default(false),
  note: z.string().max(600).optional(),
});
export type DecisionInput = z.infer<typeof decisionSchema>;

export const cardSubmitSchema = z.object({
  card: z.enum(["targeted_intel", "interception", "information_warfare", "new_front", "political_shock"]),
  payload: z.record(z.string(), z.unknown()),
});

export const rulingSchema = z.object({
  requestId: z.string().uuid(),
  approve: z.boolean(),
  probability: z.number().min(0.01).max(0.99).nullable().optional(),
});

export const messageSchema = z.object({ text: z.string().trim().min(1).max(1500) });
export const romeProposalSchema = z.object({ text: z.string().trim().min(10).max(1200) });

// ------------------------------------------------------------------ temps réel

export interface RuntimeAssembly {
  queue: string[];
  speaker: string | null;
  mode: "speech" | "reaction" | "rebuttal" | "transition" | "idle";
  deadline: number | null;
  floorRequests: string[];
  rebuttalsUsed: Record<string, number>;
  budgetEndsAt: number | null;
}

export interface RuntimeCall {
  id: string;
  a: string;
  b: string;
  startedAt: number;
  deadline: number;
}

export interface RuntimeInvite {
  id: string;
  from: string;
  to: string;
  expiresAt: number;
}

export interface RuntimeState {
  sessionId: string;
  status: SessionStatus;
  phase: Phase;
  round: number;
  roundsPlanned: number;
  phaseDeadline: number | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  serverNow: number;
  lastRound: boolean;
  ready: string[];
  submitted: string[];
  diplomacyDone: string[];
  assembly: RuntimeAssembly | null;
  calls: RuntimeCall[];
  invites: RuntimeInvite[];
  overlay: { type: "rome"; id: string; acked: string[]; deadline: number } | null;
  endsAt: number | null;
  pendingRequests: number;
}

export const SOCKET_EVENTS = {
  state: "state",
  runtime: "runtime",
  view: "view",
  lobby: "lobby",
  message: "message",
  invite: "invite",
  rome: "rome",
  lastRound: "last_round",
  report: "report",
  ended: "ended",
  error: "error_message",
  requests: "requests",
} as const;
