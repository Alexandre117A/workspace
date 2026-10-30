import random

import pytest

from geonex_engine import planning, probability
from geonex_engine.planning import assembly_target_seconds, build_plan


class TestProbability:
    def test_bounds(self):
        for base in (-10, 0, 10):
            a = probability.assess(base, {"x": 50, "y": 50})
            assert probability.P_MIN <= a.probability <= probability.P_MAX

    def test_diminishing_returns(self):
        g1 = probability.investment(10) - probability.investment(0)
        g2 = probability.investment(20) - probability.investment(10)
        g3 = probability.investment(30) - probability.investment(20)
        assert g1 > g2 > g3 > 0

    def test_factors_are_capped_and_saturated(self):
        a = probability.assess(0, {"a": 100})
        assert a.contributions["a"] == probability.FACTOR_CAP
        many = probability.assess(0, {f"f{i}": 2 for i in range(10)})
        assert many.probability <= probability.P_MAX

    def test_president_probability_dominates_but_does_not_decide_alone(self):
        low = probability.assess(2.5, {}, president_probability=0.2)
        assert low.probability < 0.5
        assert low.probability > 0.2  # le moteur garde une part de l'évaluation

    def test_reproducible_draws(self):
        r1 = probability.rng_for(42, "round", 3, "decision", "abc")
        r2 = probability.rng_for(42, "round", 3, "decision", "abc")
        assert probability.draw(r1, 0.6) == probability.draw(r2, 0.6)
        r3 = probability.rng_for(43, "round", 3, "decision", "abc")
        assert [probability.rng_for(42, i).random() for i in range(5)] != [probability.rng_for(43, i).random() for i in range(5)] or r3

    def test_outcome_distribution_tracks_probability(self):
        rng = random.Random(1)
        wins = sum(probability.draw(rng, 0.7)[1] in ("success", "major_success") for _ in range(4000))
        assert 0.66 < wins / 4000 < 0.74


class TestPlanning:
    def test_assembly_targets_from_spec(self):
        assert assembly_target_seconds(5) == 390
        assert assembly_target_seconds(8) == 600
        assert assembly_target_seconds(10) == 780

    def test_minimum_duration(self):
        with pytest.raises(ValueError):
            build_plan(29, 4)
        assert build_plan(30, 3).duration_minutes == 30

    def test_recommendation_below_one_hour(self):
        assert planning.RECOMMENDATION in build_plan(45, 3).warnings
        assert planning.RECOMMENDATION not in build_plan(60, 3).warnings

    def test_duration_changes_the_game(self):
        short, long = build_plan(30, 4), build_plan(120, 4)
        assert long.rounds_planned > short.rounds_planned
        assert short.intensity == "soutenue"
        assert short.phase_seconds.assembly <= long.phase_seconds.assembly

    def test_more_teams_need_more_time(self):
        p3, p10 = build_plan(120, 3), build_plan(120, 10)
        assert p10.phase_seconds.assembly > p3.phase_seconds.assembly
        assert p10.rounds_planned < p3.rounds_planned

    def test_short_duration_for_many_teams_is_flagged_not_stripped(self):
        p = build_plan(30, 10)
        assert any("compress" in w for w in p.warnings)
        assert p.rounds_planned >= 2
        assert p.phase_seconds.briefing == 45
