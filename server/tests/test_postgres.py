"""Runs only with TEST_DATABASE_URL set (a throwaway Postgres with schema.sql loaded)."""

import os

import pytest

from app.store import PostgresStore, hash_token

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")


def test_device_lifecycle_and_sent_log():
    s = PostgresStore(URL)
    did = s.create_device(hash_token("t"), {"endpoint": "https://x", "keys": {"p256dh": "a", "auth": "b"}}, "Europe/Rome")
    d = s.get_device(did)
    assert d["token_hash"] == hash_token("t") and d["rules"] == [] and d["days"] == {}
    s.update_device(did, {"rules": [{"id": "w"}], "quiet": {"start": "22:30", "end": "07:00"}, "days": {"2026-11-09": {"due": {}}}, "timezone": "Europe/Rome"})
    assert s.get_device(did)["rules"] == [{"id": "w"}]
    assert did in [x["id"] for x in s.active_devices()]
    import datetime
    today = datetime.date.today().isoformat()
    assert s.mark_sent(did, "w", today) is True
    assert s.mark_sent(did, "w", today) is False
    assert s.sent_on(did, today) == {("w", today)}
    s.update_device(did, {"subscription": None})
    assert did not in [x["id"] for x in s.active_devices()]
    s.delete_device(did)
    assert s.get_device(did) is None
    assert s.get_device("not-a-uuid") is None
