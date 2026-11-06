"""Which notifications are due right now. Pure functions, no I/O.

A device keeps a list of rules (what to remind, at what local time, on which
weekdays) and, for the next few days, what each day asks for ("due": quest
key -> label) and what is already done. The server never sees weights, food
or workouts: only these keys, labels like "Upper A" and done flags.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

QUEST_KINDS = {"workout", "steps", "weigh", "water", "sleep", "diet", "check", "backup"}
KINDS = QUEST_KINDS | {"streak", "summary"}
# A reminder can still go out this long after its time (the free Render
# instance may need a minute to wake up, a tick can be late).
CATCH_UP = timedelta(minutes=15)


@dataclass(frozen=True)
class Push:
    rule_id: str
    day: str
    title: str
    body: str
    tag: str


def parse_hhmm(value: str) -> time | None:
    try:
        h, m = value.split(":")
        return time(int(h), int(m))
    except (ValueError, AttributeError):
        return None


def local_now(tz: str, now_utc: datetime) -> datetime:
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("Europe/Rome")
    return now_utc.astimezone(zone)


def in_quiet(now: time, quiet: dict | None) -> bool:
    """Quiet hours, possibly across midnight (22:30 → 07:00)."""
    if not quiet:
        return False
    start, end = parse_hhmm(quiet.get("start", "")), parse_hhmm(quiet.get("end", ""))
    if not start or not end or start == end:
        return False
    if start < end:
        return start <= now < end
    return now >= start or now < end


def js_weekday(d: date) -> int:
    """0 = Sunday … 6 = Saturday, like the app."""
    return (d.weekday() + 1) % 7


def _matches(kind: str, due: dict) -> list[str]:
    if kind == "workout":
        return [k for k in due if k.startswith("workout:")]
    return [kind] if kind in due else []


def due_pushes(device: dict, sent: set[tuple[str, str]], now_utc: datetime) -> list[Push]:
    """Notifications to send to one device now. `sent` holds (rule_id, day) already sent."""
    now = local_now(device.get("timezone") or "Europe/Rome", now_utc)
    today = now.date()
    day_key = today.isoformat()
    if in_quiet(now.time(), device.get("quiet")):
        return []
    plan = (device.get("days") or {}).get(day_key)
    out: list[Push] = []
    for rule in device.get("rules") or []:
        if not rule.get("enabled") or rule.get("kind") not in KINDS:
            continue
        rid = str(rule.get("id", ""))
        if not rid or (rid, day_key) in sent:
            continue
        if js_weekday(today) not in (rule.get("days") or list(range(7))):
            continue
        at = parse_hhmm(rule.get("time", ""))
        if not at:
            continue
        start = datetime.combine(today, at, tzinfo=now.tzinfo)
        if not (start <= now < start + CATCH_UP):
            continue
        kind = rule["kind"]
        label = ""
        if kind in QUEST_KINDS:
            if not plan:
                continue  # the app hasn't told us about today: better silent than wrong
            due = plan.get("due") or {}
            keys = _matches(kind, due)
            if not keys:
                continue  # not asked today (e.g. a rest day)
            done = set(plan.get("done") or [])
            pending = [k for k in keys if k not in done]
            if not pending:
                continue  # already done: skip the reminder
            label = " + ".join(str(due[k]) for k in pending)
        elif kind == "streak":
            if not plan or int(plan.get("pending") or 0) <= 0:
                continue
            label = str(plan.get("pending"))
        title = str(rule.get("title") or "")[:80]
        body = str(rule.get("body") or "").replace("{label}", label)[:200]
        out.append(Push(rule_id=rid, day=day_key, title=title, body=body, tag=f"{kind}-{day_key}"))
    return out


def prune_days(days: dict, today: date, keep_back: int = 1, keep_ahead: int = 10) -> dict:
    """Only a short window of days is kept."""
    lo, hi = today - timedelta(days=keep_back), today + timedelta(days=keep_ahead)
    out = {}
    for k, v in (days or {}).items():
        try:
            d = date.fromisoformat(k)
        except ValueError:
            continue
        if lo <= d <= hi:
            out[k] = v
    return out
