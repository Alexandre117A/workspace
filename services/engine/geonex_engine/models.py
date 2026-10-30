"""Modèles de données du moteur GEONEX.

`WorldState` est la vérité interne de la simulation. Tout ce qui est envoyé
aux clients passe par `views.py`, qui filtre selon les quatre niveaux
d'information (vérité, public, équipe, Président).
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

CapitalKey = Literal["political", "economic", "military"]
CAPITAL_KEYS: tuple[str, ...] = ("political", "economic", "military")
Mode = Literal["contemporary", "historical", "fictional"]
ActorKind = Literal["state", "organization", "company", "armed_group", "coalition", "polity", "other"]


class SourceRef(BaseModel):
    """Traçabilité d'une donnée : fait confirmé, estimation, hypothèse ou fiction."""

    status: Literal["confirmed", "estimate", "hypothesis", "fiction"] = "estimate"
    label: Optional[str] = None
    url: Optional[str] = None
    retrieved_at: Optional[str] = None


class Fact(BaseModel):
    text: str
    source: SourceRef = Field(default_factory=SourceRef)


class Capitals(BaseModel):
    political: float = 50.0
    economic: float = 50.0
    military: float = 50.0

    def get(self, key: str) -> float:
        return float(getattr(self, key))

    def set(self, key: str, value: float) -> None:
        setattr(self, key, round(max(0.0, min(100.0, value)), 2))

    def add(self, key: str, delta: float) -> float:
        before = self.get(key)
        self.set(key, before + delta)
        return self.get(key) - before

    def total(self) -> float:
        return self.political + self.economic + self.military


class Resource(BaseModel):
    key: str
    label: str
    quantity: float
    unit: str = ""
    category: Literal["political", "economic", "military", "other"] = "military"
    regen_per_round: float = 0.0
    max_quantity: Optional[float] = None
    usable: bool = True  # False : ressource de dissuasion, jamais consommée par une action
    abstraction: bool = False  # True : unité de jeu GEONEX, pas une donnée réelle
    source: SourceRef = Field(default_factory=SourceRef)


class ResourceLock(BaseModel):
    key: str
    quantity: float
    release_round: int
    reason: str = ""


class Region(BaseModel):
    name: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    x: Optional[float] = None  # cartes fictives : coordonnées schématiques 0..100
    y: Optional[float] = None


class Objective(BaseModel):
    id: str
    kind: Literal["primary", "secondary", "coalition", "secret"]
    text: str
    metric: dict[str, Any]


class Personality(BaseModel):
    aggression: float = 0.5
    caution: float = 0.5
    cooperation: float = 0.5


class Actor(BaseModel):
    id: str
    name: str
    short: str
    kind: ActorKind = "state"
    iso_a3: Optional[str] = None
    iso_n3: list[str] = Field(default_factory=list)  # identifiants Natural Earth (world-atlas)
    leader: Optional[str] = None
    leader_source: SourceRef = Field(default_factory=lambda: SourceRef(status="hypothesis"))
    description: str = ""
    camp: str = "neutral"
    capitals: Capitals = Field(default_factory=Capitals)
    initial_capitals: Capitals = Field(default_factory=Capitals)
    capital_spent: Capitals = Field(default_factory=lambda: Capitals(political=0, economic=0, military=0))
    resources: list[Resource] = Field(default_factory=list)
    locks: list[ResourceLock] = Field(default_factory=list)
    stability: float = 60.0
    cohesion: float = 60.0
    approval: float = 50.0
    indicators_source: SourceRef = Field(default_factory=SourceRef)
    objectives: list[Objective] = Field(default_factory=list)
    red_lines: list[str] = Field(default_factory=list)
    secrets: list[str] = Field(default_factory=list)
    facts: list[Fact] = Field(default_factory=list)
    relevance: float = 0.5
    engagement: float = 0.5  # implication dans le théâtre (pondère le rapport de force)
    controlled_by: Literal["human", "npc"] = "npc"
    personality: Personality = Field(default_factory=Personality)
    regions: list[Region] = Field(default_factory=list)
    history: list[dict[str, Any]] = Field(default_factory=list)

    def resource(self, key: str) -> Optional[Resource]:
        return next((r for r in self.resources if r.key == key), None)

    def locked(self, key: str) -> float:
        return sum(lock.quantity for lock in self.locks if lock.key == key)

    def available(self, key: str) -> float:
        res = self.resource(key)
        if res is None:
            return 0.0
        return max(0.0, res.quantity - self.locked(key))


class Relation(BaseModel):
    a: str
    b: str
    trust: float = 0.0  # -100..100
    tension: float = 20.0  # 0..100
    alliance: bool = False
    at_war: bool = False


class Zone(BaseModel):
    id: str
    name: str
    domain: str = "military"
    region: Region
    control: dict[str, float] = Field(default_factory=dict)  # actor_id -> part de contrôle
    tension: float = 40.0
    created_round: int = 0
    origin: str = "scenario"


class Commitment(BaseModel):
    id: str
    round: int
    from_actor: str
    to_actor: Optional[str] = None
    kind: Literal["promise", "non_aggression", "support", "threat", "alliance", "agreement", "ceasefire"]
    text: str
    status: Literal["open", "honored", "broken", "expired"] = "open"
    due_round: int
    public: bool = False
    source: str = "diplomacy"
    confidence: float = 0.6
    resolved_round: Optional[int] = None


class Effect(BaseModel):
    actor: str
    field: str  # political|economic|military|stability|approval|cohesion|trust:<id>|tension:<id>|resource:<key>|control:<zone>
    delta: float
    reason: str = ""


class Event(BaseModel):
    id: str
    round: int
    kind: str
    scope: Literal["public", "private", "president", "hidden"] = "public"
    audience: list[str] = Field(default_factory=list)
    title: str
    text: str
    figures: dict[str, Any] = Field(default_factory=dict)
    location: Optional[Region] = None
    actors: list[str] = Field(default_factory=list)
    effects: list[Effect] = Field(default_factory=list)
    cause_refs: list[str] = Field(default_factory=list)
    reveal_in_archive: bool = True


class Operation(BaseModel):
    id: str
    actor: str
    category: str
    targets: list[str] = Field(default_factory=list)
    zone: Optional[str] = None
    started_round: int
    resolve_round: int
    secret: bool = True
    status: Literal["pending", "resolved", "cancelled"] = "pending"
    params: dict[str, Any] = Field(default_factory=dict)
    outcome: Optional[str] = None


class IntelReport(BaseModel):
    id: str
    round: int
    owner: str
    kind: str  # targeted_intel | interception | passive
    subjects: list[str]
    question: str
    finding: str
    accuracy: Literal["exact", "partial", "uncertain", "misleading"]
    reliability_pct: int
    confidence_label: Literal["Très incertaine", "Fragile", "Plausible", "Crédible", "Haute confiance"]
    source_quality: float
    corroboration: int = 0
    truth_summary: str = ""  # vérité moteur — jamais transmise à l'équipe pendant la partie
    deceptive: bool = False
    topics: list[str] = Field(default_factory=list)
    signal: dict[str, float] = Field(default_factory=dict)  # ce que l'équipe croit savoir (perception)


class CardUse(BaseModel):
    id: str
    card: Literal["targeted_intel", "interception", "information_warfare", "new_front", "political_shock"]
    actor: str
    round: int
    payload: dict[str, Any] = Field(default_factory=dict)
    official_request: str = ""
    status: Literal["submitted", "resolved", "rejected"] = "submitted"
    result: dict[str, Any] = Field(default_factory=dict)


class RomeCommunique(BaseModel):
    id: str
    round: int
    origin: Literal["auto", "president"] = "auto"
    kind: str
    title: str
    dateline: str
    body: str
    figures: dict[str, Any] = Field(default_factory=dict)
    general_impact: str
    per_actor: dict[str, list[str]] = Field(default_factory=dict)
    effects: list[Effect] = Field(default_factory=list)
    new_actor: Optional[Actor] = None
    new_zone: Optional[Zone] = None
    cause_refs: list[str] = Field(default_factory=list)
    hidden_cause: str = ""
    generated_by: str = "rules"
    delivered: bool = False
    deferred_changes: dict[str, Any] = Field(default_factory=dict)  # appliqués seulement à la diffusion


class AuditRecord(BaseModel):
    id: str
    round: int
    ref: str
    actor: str
    category: str
    factors: dict[str, float]
    base_logit: float
    probability_engine: float
    president_probability: Optional[float] = None
    probability: float
    roll: float
    outcome: str
    seed_key: str


class RoundSummary(BaseModel):
    round: int
    sim_time_label: str
    title: str
    narrative: str
    highlights: list[str] = Field(default_factory=list)
    decisions: dict[str, list[str]] = Field(default_factory=dict)
    balance: dict[str, float] = Field(default_factory=dict)
    generated_by: str = "rules"


class PhasePlan(BaseModel):
    briefing: int
    assembly: int
    diplomacy: int
    decisions: int
    arbitration: int
    consequences: int


class AssemblyPlan(BaseModel):
    speech_seconds: int
    reaction_seconds: int
    rebuttal_seconds: int
    max_rebuttals_per_team: int
    transition_seconds: int


class SessionPlan(BaseModel):
    duration_minutes: int
    team_count: int
    rounds_planned: int
    phase_seconds: PhasePlan
    assembly: AssemblyPlan
    round_seconds: int
    setup_seconds: int
    closing_seconds: int
    warnings: list[str] = Field(default_factory=list)
    intensity: Literal["soutenue", "standard", "approfondie"] = "standard"
    rome_max: int = 2
    sim_step_hours: float = 24.0


class Theatre(BaseModel):
    name: str
    map_kind: Literal["natural_earth", "fictional"] = "natural_earth"
    iso_n3: list[str] = Field(default_factory=list)
    center: Optional[tuple[float, float]] = None  # (lon, lat)
    border_warning: Optional[str] = None
    fictional_regions: list[dict[str, Any]] = Field(default_factory=list)
    maritime: bool = False


class Setting(BaseModel):
    mode: Mode
    title: str
    topic: str
    start_label: str
    start_date: Optional[str] = None  # ISO (AAAA-MM-JJ) — mondes réels
    knowledge_cutoff: Optional[str] = None  # simulations historiques : rien n'est connu après cette date
    era: str = "contemporary"  # ancient|medieval|early_modern|napoleonic|industrial|cold_war|contemporary|space|fantasy
    theatre: Theatre
    universe_notes: str = ""
    tempo: Literal["military", "diplomatic", "mixed"] = "mixed"
    camps: dict[str, str] = Field(default_factory=dict)  # camp_id -> libellé
    special_rules: list[str] = Field(default_factory=list)


class Generation(BaseModel):
    provider: str = "rules"
    notes: list[str] = Field(default_factory=list)
    sources: list[SourceRef] = Field(default_factory=list)
    duration_seconds: float = 0.0


class Scenario(BaseModel):
    """Conditions générales d'une simulation, réutilisables par plusieurs sessions."""

    schema_version: int = 1
    id: str
    mode: Mode
    title: str
    prompt: str
    summary: str
    setting: Setting
    actors: list[Actor]
    relations: list[Relation] = Field(default_factory=list)
    zones: list[Zone] = Field(default_factory=list)
    generation: Generation = Field(default_factory=Generation)
    answers: list[dict[str, str]] = Field(default_factory=list)


class RomeState(BaseModel):
    last_round: int = 0
    count: int = 0
    window_entered_round: Optional[int] = None
    pending_id: Optional[str] = None


class WorldState(BaseModel):
    schema_version: int = 1
    session_id: str
    scenario_id: str
    seed: int
    setting: Setting
    plan: SessionPlan
    round: int = 0
    sim_elapsed_hours: float = 0.0
    actors: dict[str, Actor]
    relations: dict[str, Relation] = Field(default_factory=dict)
    zones: list[Zone] = Field(default_factory=list)
    commitments: list[Commitment] = Field(default_factory=list)
    operations: list[Operation] = Field(default_factory=list)
    events: list[Event] = Field(default_factory=list)
    intel: list[IntelReport] = Field(default_factory=list)
    cards_used: list[CardUse] = Field(default_factory=list)
    communiques: list[RomeCommunique] = Field(default_factory=list)
    audit: list[AuditRecord] = Field(default_factory=list)
    rounds: list[RoundSummary] = Field(default_factory=list)
    balance_history: list[dict[str, Any]] = Field(default_factory=list)
    rome: RomeState = Field(default_factory=RomeState)
    decisions_log: list[dict[str, Any]] = Field(default_factory=list)
    comms: list[dict[str, Any]] = Field(default_factory=list)  # échanges privés (jamais exposés pendant la partie)
    generation: Generation = Field(default_factory=Generation)
    id_counter: int = 0
    finished: bool = False

    def next_id(self, prefix: str) -> str:
        self.id_counter += 1
        return f"{prefix}{self.id_counter:05d}"

    def humans(self) -> list[Actor]:
        return [a for a in self.actors.values() if a.controlled_by == "human"]

    def relation(self, a: str, b: str) -> Relation:
        key = relation_key(a, b)
        rel = self.relations.get(key)
        if rel is None:
            x, y = sorted((a, b))
            rel = Relation(a=x, b=y)
            self.relations[key] = rel
        return rel

    def zone(self, zone_id: str) -> Optional[Zone]:
        return next((z for z in self.zones if z.id == zone_id), None)


def relation_key(a: str, b: str) -> str:
    x, y = sorted((a, b))
    return f"{x}|{y}"
