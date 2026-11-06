"""Where devices and the sent log live: Supabase Postgres in production, memory in tests/dev.

Schema: server/supabase/schema.sql.
"""

from __future__ import annotations

import hashlib
import json
import threading
import uuid
from datetime import datetime, timezone
from typing import Protocol


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Store(Protocol):
    def create_device(self, token_hash: str, subscription: dict, tz: str) -> str: ...
    def get_device(self, device_id: str) -> dict | None: ...
    def update_device(self, device_id: str, values: dict) -> None: ...
    def delete_device(self, device_id: str) -> None: ...
    def active_devices(self) -> list[dict]: ...
    def sent_on(self, device_id: str, day: str) -> set[tuple[str, str]]: ...
    def mark_sent(self, device_id: str, rule_id: str, day: str) -> bool: ...


FIELDS = ("subscription", "timezone", "rules", "quiet", "days")


class MemoryStore:
    def __init__(self) -> None:
        self.devices: dict[str, dict] = {}
        self.sent: set[tuple[str, str, str]] = set()
        self.lock = threading.Lock()

    def create_device(self, token_hash, subscription, tz):
        did = str(uuid.uuid4())
        with self.lock:
            self.devices[did] = {"id": did, "token_hash": token_hash, "subscription": subscription, "timezone": tz, "rules": [], "quiet": None, "days": {}}
        return did

    def get_device(self, device_id):
        d = self.devices.get(device_id)
        return dict(d) if d else None

    def update_device(self, device_id, values):
        with self.lock:
            if device_id in self.devices:
                self.devices[device_id].update({k: v for k, v in values.items() if k in FIELDS})

    def delete_device(self, device_id):
        with self.lock:
            self.devices.pop(device_id, None)
            self.sent = {s for s in self.sent if s[0] != device_id}

    def active_devices(self):
        return [dict(d) for d in self.devices.values() if d.get("subscription")]

    def sent_on(self, device_id, day):
        return {(r, d) for (dev, r, d) in self.sent if dev == device_id and d == day}

    def mark_sent(self, device_id, rule_id, day):
        with self.lock:
            key = (device_id, rule_id, day)
            if key in self.sent:
                return False
            self.sent.add(key)
            return True


class PostgresStore:
    """One short connection per call: traffic is a handful of requests a minute."""

    def __init__(self, url: str) -> None:
        import psycopg  # imported here so tests don't need a database driver loaded

        self.psycopg = psycopg
        self.url = url

    def _conn(self):
        return self.psycopg.connect(self.url, autocommit=True, prepare_threshold=None)

    def create_device(self, token_hash, subscription, tz):
        with self._conn() as c:
            row = c.execute(
                "insert into push_devices (token_hash, subscription, timezone) values (%s, %s, %s) returning id",
                (token_hash, json.dumps(subscription), tz),
            ).fetchone()
        return str(row[0])

    def get_device(self, device_id):
        try:
            uuid.UUID(device_id)
        except ValueError:
            return None
        with self._conn() as c:
            row = c.execute(
                "select id, token_hash, subscription, timezone, rules, quiet, days from push_devices where id = %s",
                (device_id,),
            ).fetchone()
        if not row:
            return None
        keys = ("id", "token_hash", "subscription", "timezone", "rules", "quiet", "days")
        d = dict(zip(keys, row))
        d["id"] = str(d["id"])
        return d

    def update_device(self, device_id, values):
        cols = [k for k in values if k in FIELDS]
        if not cols:
            return
        sets = ", ".join(f"{k} = %s" for k in cols) + ", updated_at = now()"
        # None stays SQL NULL (not JSON null), so "where subscription is not null" works.
        params = [values[k] if k == "timezone" or values[k] is None else json.dumps(values[k]) for k in cols]
        with self._conn() as c:
            c.execute(f"update push_devices set {sets} where id = %s", (*params, device_id))  # noqa: S608 — column names come from FIELDS

    def delete_device(self, device_id):
        with self._conn() as c:
            c.execute("delete from push_devices where id = %s", (device_id,))

    def active_devices(self):
        with self._conn() as c:
            rows = c.execute(
                "select id, subscription, timezone, rules, quiet, days from push_devices where subscription is not null"
            ).fetchall()
        keys = ("id", "subscription", "timezone", "rules", "quiet", "days")
        return [{**dict(zip(keys, r)), "id": str(r[0])} for r in rows]

    def sent_on(self, device_id, day):
        with self._conn() as c:
            rows = c.execute("select rule_id, day from push_sent where device_id = %s and day = %s", (device_id, day)).fetchall()
        return {(r[0], str(r[1])) for r in rows}

    def mark_sent(self, device_id, rule_id, day):
        with self._conn() as c:
            row = c.execute(
                "insert into push_sent (device_id, rule_id, day) values (%s, %s, %s) on conflict do nothing returning 1",
                (device_id, rule_id, day),
            ).fetchone()
            # Keep the log short.
            c.execute("delete from push_sent where day < current_date - 7")
        return row is not None


def make_store(database_url: str) -> Store:
    return PostgresStore(database_url) if database_url else MemoryStore()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
