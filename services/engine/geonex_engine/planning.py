"""Planification d'une session : la durée et le nombre d'équipes modifient
réellement le déroulement (nombre de rounds, budgets de parole, rythme)."""
from __future__ import annotations

from .models import AssemblyPlan, PhasePlan, SessionPlan

MIN_DURATION_MINUTES = 30
RECOMMENDED_MINUTES = 60
RECOMMENDATION = "Pour profiter pleinement du moteur de simulation, une durée d'au moins une heure est recommandée."

# Budgets cibles de l'Assemblée publique (secondes) — cahier des charges §59.
_ASSEMBLY_ANCHORS = [(1, 75), (2, 170), (3, 250), (5, 390), (8, 600), (10, 780)]


def assembly_target_seconds(team_count: int) -> int:
    n = max(1, team_count)
    if n >= _ASSEMBLY_ANCHORS[-1][0]:
        last_n, last_s = _ASSEMBLY_ANCHORS[-1]
        return int(last_s + (n - last_n) * 78)
    for (n0, s0), (n1, s1) in zip(_ASSEMBLY_ANCHORS, _ASSEMBLY_ANCHORS[1:]):
        if n0 <= n <= n1:
            return int(round(s0 + (s1 - s0) * (n - n0) / (n1 - n0)))
    return _ASSEMBLY_ANCHORS[0][1]


def _assembly_plan(budget: int, team_count: int, compression: float) -> AssemblyPlan:
    speech = int(max(30, min(60, round(60 * compression))))
    reaction = 7
    transition = 3
    per_team_fixed = speech + reaction + transition
    remaining = max(0, budget - team_count * per_team_fixed)
    rebuttal = 20 if compression >= 0.8 else 15
    max_rebuttals = 0
    if team_count > 1 and remaining > 0:
        max_rebuttals = max(0, min(2, remaining // (rebuttal * team_count)))
        if max_rebuttals == 0 and remaining >= rebuttal * 2:
            max_rebuttals = 1
    return AssemblyPlan(
        speech_seconds=speech,
        reaction_seconds=reaction,
        rebuttal_seconds=rebuttal,
        max_rebuttals_per_team=int(max_rebuttals),
        transition_seconds=transition,
    )


def build_plan(duration_minutes: int, team_count: int, tempo: str = "mixed") -> SessionPlan:
    if duration_minutes < MIN_DURATION_MINUTES:
        raise ValueError(f"La durée minimale est de {MIN_DURATION_MINUTES} minutes.")
    team_count = max(1, int(team_count))
    total = duration_minutes * 60
    setup = 150  # lecture des dossiers confidentiels
    closing = 180  # résolution finale, animation, résultats
    available = total - setup - closing
    warnings: list[str] = []
    if duration_minutes < RECOMMENDED_MINUTES:
        warnings.append(RECOMMENDATION)

    def round_len(compression: float) -> tuple[int, PhasePlan, AssemblyPlan]:
        assembly = int(assembly_target_seconds(team_count) * compression)
        phases = PhasePlan(
            briefing=45,
            assembly=assembly,
            diplomacy=int(max(150, 300 * compression)),
            decisions=int(max(90, 120 * compression)),
            arbitration=60 if compression >= 0.8 else 45,
            consequences=int(max(40, 60 * compression)),
        )
        resolution_allowance = 15
        length = (
            phases.briefing + phases.assembly + phases.diplomacy + phases.decisions
            + phases.arbitration + phases.consequences + resolution_allowance
        )
        return length, phases, _assembly_plan(phases.assembly, team_count, compression)

    compression = 1.0
    length, phases, assembly = round_len(compression)
    rounds = available // length
    # Il faut au moins 3 rounds pour que les cartes (round 2+) et le rapport de
    # force (round 3+) existent réellement : on compresse les phases plutôt que
    # de supprimer ces mécaniques.
    while rounds < 3 and compression > 0.55:
        compression = round(compression - 0.05, 2)
        length, phases, assembly = round_len(compression)
        rounds = available // length
    if compression < 1.0:
        warnings.append(
            f"Durée courte au regard des {team_count} équipes : les phases sont compressées "
            f"(≈{int(compression * 100)} % du rythme nominal) pour préserver au moins trois rounds."
        )
    if rounds < 3:
        warnings.append(
            "Même compressé, ce format ne permet pas trois rounds complets : le rapport de force "
            "public pourrait ne jamais être débloqué. Augmentez la durée ou réduisez le nombre d'équipes."
        )
    rounds = max(2, int(rounds))
    if team_count >= 8 and duration_minutes < 90:
        warnings.append("Avec huit équipes ou plus, une durée d'au moins 1 h 30 est conseillée pour les débats.")

    intensity = "soutenue" if rounds <= 3 else ("approfondie" if rounds >= 6 else "standard")
    step = {"military": 8.0, "diplomatic": 72.0, "mixed": 24.0}.get(tempo, 24.0)
    if intensity == "soutenue":
        step *= 1.5  # moins de rounds : chaque round couvre davantage de temps simulé
    rome_max = 1 if rounds <= 3 else (2 if rounds <= 6 else 3)
    return SessionPlan(
        duration_minutes=duration_minutes,
        team_count=team_count,
        rounds_planned=rounds,
        phase_seconds=phases,
        assembly=assembly,
        round_seconds=int(length),
        setup_seconds=setup,
        closing_seconds=closing,
        warnings=warnings,
        intensity=intensity,
        rome_max=rome_max,
        sim_step_hours=step,
    )
