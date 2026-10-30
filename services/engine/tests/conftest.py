import os

os.environ["GEONEX_RESEARCH"] = "off"
os.environ["GEONEX_AI"] = "off"
os.environ.pop("GEONEX_ENGINE_TOKEN", None)

import pytest  # noqa: E402

from geonex_engine import scenario_builder, session  # noqa: E402


@pytest.fixture
def scenario():
    sc = scenario_builder.build("contemporary", "Crise Chine–Taïwan", 4, seed=7)
    sc.id = "sc-test"
    return sc


@pytest.fixture
def world(scenario):
    w = session.prepare(scenario, "session-test", 4, 90, seed=42)
    ids = session.select_playable(w, 4)
    session.assign(w, ids)
    return w


def decision(id, actor, category, targets=(), zone=None, political=0, economic=0, military=0, resources=(), secret=False, **kw):
    return {"id": id, "actor": actor, "category": category, "targets": list(targets), "zone": zone,
            "allocation": {"political": political, "economic": economic, "military": military},
            "resources": list(resources), "secret": secret, **kw}
