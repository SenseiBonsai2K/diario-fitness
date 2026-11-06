from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.config import Settings
from app.store import MemoryStore

SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "k", "auth": "a"}}


@pytest.fixture()
def env():
    sent = []
    store = MemoryStore()
    s = Settings(env="test", database_url="", vapid_public_key="PUB", vapid_private_key="PRIV", vapid_subject="mailto:x@example.com",
                 register_key="reg-key", cron_secret="cron", allowed_origins=["https://senseibonsai2k.github.io"], sentry_dsn="")
    app = main.create_app(s, store, sender=lambda sub, payload: sent.append(payload))
    return TestClient(app), store, sent


def register(client):
    r = client.post("/api/v1/devices", json={"subscription": SUB, "timezone": "Europe/Rome"}, headers={"X-Register-Key": "reg-key"})
    assert r.status_code == 201
    return r.json()


def test_health_and_key(env):
    client, _, _ = env
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/push/key").json() == {"publicKey": "PUB"}


def test_register_needs_the_key(env):
    client, _, _ = env
    r = client.post("/api/v1/devices", json={"subscription": SUB}, headers={"X-Register-Key": "nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "bad_register_key"


def test_validation_errors_use_the_envelope(env):
    client, _, _ = env
    r = client.post("/api/v1/devices", json={"subscription": {"endpoint": "http://x"}}, headers={"X-Register-Key": "reg-key"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_sync_needs_the_device_token(env):
    client, _, _ = env
    dev = register(client)
    r = client.put(f"/api/v1/devices/{dev['id']}", json={}, headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 404


def test_sync_then_tick_sends_once(env, monkeypatch):
    client, store, sent = env
    dev = register(client)
    auth = {"Authorization": f"Bearer {dev['token']}"}
    body = {
        "timezone": "Europe/Rome",
        "rules": [{"id": "w", "kind": "workout", "time": "17:30", "enabled": True, "title": "Allenamento", "body": "Oggi: {label}"}],
        "quiet": {"start": "22:30", "end": "07:00"},
        "days": {"2026-11-09": {"due": {"workout:upperA": "Upper A"}, "done": [], "pending": 1}},
    }
    fixed = datetime(2026, 11, 9, 16, 31, tzinfo=timezone.utc)
    monkeypatch.setattr(main, "utcnow", lambda: fixed)
    r = client.put(f"/api/v1/devices/{dev['id']}", json=body, headers=auth)
    assert r.status_code == 200 and r.json()["rules"] == 1 and r.json()["days"] == 1
    assert client.post("/api/v1/tick").status_code == 401
    assert client.post("/api/v1/tick", headers={"X-Cron-Secret": "cron"}).json()["sent"] == 1
    assert client.post("/api/v1/tick", headers={"X-Cron-Secret": "cron"}).json()["sent"] == 0
    assert sent == [{"title": "Allenamento", "body": "Oggi: Upper A", "tag": "workout-2026-11-09", "url": "./"}]


def test_test_push_and_forget(env):
    client, store, sent = env
    dev = register(client)
    auth = {"Authorization": f"Bearer {dev['token']}"}
    assert client.post(f"/api/v1/devices/{dev['id']}/test", headers=auth).json() == {"sent": 1}
    assert client.delete(f"/api/v1/devices/{dev['id']}", headers=auth).status_code == 204
    assert store.get_device(dev["id"]) is None


def test_cors_allows_only_the_app(env):
    client, _, _ = env
    ok = client.options("/api/v1/health", headers={"Origin": "https://senseibonsai2k.github.io", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "https://senseibonsai2k.github.io"
    bad = client.options("/api/v1/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers
