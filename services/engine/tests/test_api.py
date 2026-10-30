import time

from fastapi.testclient import TestClient

from geonex_engine.api import app

client = TestClient(app)


def wait_job(job_id, timeout=20):
    start = time.time()
    while time.time() - start < timeout:
        job = client.get(f"/scenarios/jobs/{job_id}").json()
        if job["status"] in ("done", "failed"):
            return job
        time.sleep(0.05)
    raise AssertionError("job timeout")


def test_health():
    r = client.get("/health").json()
    assert r["status"] == "ok" and r["ai"]["enabled"] is False


def test_full_flow_over_http():
    job_id = client.post("/scenarios/jobs", json={"mode": "contemporary", "prompt": "Guerre entre l'Iran et les États-Unis", "players": 3, "seed": 5}).json()["job_id"]
    job = wait_job(job_id)
    assert job["status"] == "done", job
    assert all(s["status"] == "done" for s in job["steps"])
    assert job["progress"] == 1.0
    scenario = job["result"]
    scenario["id"] = "sc"
    prep = client.post("/sessions/prepare", json={"scenario": scenario, "session_id": "S", "team_count": 3, "duration_minutes": 60, "seed": 9}).json()
    assert set(prep["playable"][:2]) == {"IRN", "USA"}
    asg = client.post("/sessions/assign", json={"world": prep["world"], "team_count": 3}).json()
    world = asg["world"]
    assert set(asg["dossiers"]) == set(asg["assignment"])
    dossier = asg["dossiers"]["IRN"]
    assert dossier["objectives"] and dossier["capitals"]
    for rnd in range(1, 4):
        b = client.post("/rounds/begin", json={"world": world}).json()
        world = b["world"]
        assert b["briefing"]["round"] == rnd and b["briefing"]["speaking_order"]
        v = client.post("/decisions/validate", json={"world": world, "actor_id": "IRN", "decisions": [
            {"id": f"x{rnd}", "category": "military_strike", "targets": ["USA"], "allocation": {"military": 10}}]}).json()
        assert v["errors"] == {} and v["needs_arbitration"] == [f"x{rnd}"]
        if rnd == 2:
            card = client.post("/cards/submit", json={"world": world, "actor_id": "USA", "card": "political_shock",
                                                       "payload": {"target": "IRN", "intent": "Rupture de la coalition gouvernementale", "invest": {"political": 6}}})
            assert card.status_code == 200, card.text
            world = card.json()["world"]
        res = client.post("/rounds/resolve", json={"world": world, "decisions": [
            {"id": f"x{rnd}", "actor": "IRN", "category": "military_strike", "targets": ["USA"], "allocation": {"military": 10}, "president_probability": 0.4, "ruling": "approved"}],
            "messages": []}).json()
        world = res["world"]
        assert res["report"]["private"]["IRN"]["capital_changes"]["military"]["reasons"]
        chk = client.post("/rome/check", json={"world": world, "phase": "diplomacy"}).json()
        world = chk["world"]
    fin = client.post("/game/finalize", json={"world": world, "meta": {"duration": 3600}}).json()
    assert fin["archive"]["winner"] and len(fin["archive"]["ranking"]) == 3


def test_historical_without_ai_returns_clear_error():
    job_id = client.post("/scenarios/jobs", json={"mode": "historical", "prompt": "Bataille de Marathon", "players": 3}).json()["job_id"]
    job = wait_job(job_id)
    assert job["status"] == "failed" and "IA" in job["error"]


def test_engine_token_enforced(monkeypatch):
    monkeypatch.setenv("GEONEX_ENGINE_TOKEN", "secret")
    assert client.post("/questions/next", json={"description": "x"}).status_code == 401
    assert client.post("/questions/next", json={"description": "x"}, headers={"x-engine-token": "secret"}).status_code == 200
