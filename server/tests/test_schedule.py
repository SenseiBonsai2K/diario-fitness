from datetime import datetime, timezone

from app.schedule import due_pushes, in_quiet, parse_hhmm, prune_days


def device(**kw):
    d = {
        "timezone": "Europe/Rome",
        "quiet": {"start": "22:30", "end": "07:00"},
        "rules": [
            {"id": "w", "kind": "workout", "time": "17:30", "days": [0, 1, 2, 3, 4, 5, 6], "enabled": True, "title": "Allenamento", "body": "Oggi: {label}"},
            {"id": "s", "kind": "steps", "time": "19:00", "days": [0, 1, 2, 3, 4, 5, 6], "enabled": True, "title": "Passi", "body": "Mancano passi"},
            {"id": "k", "kind": "streak", "time": "21:30", "enabled": True, "title": "Serie", "body": "{label} quest aperte"},
            {"id": "z", "kind": "summary", "time": "20:00", "days": [0], "enabled": True, "title": "Riepilogo", "body": "Settimana"},
        ],
        "days": {"2026-11-09": {"due": {"workout:upperA": "Upper A", "steps": "10.000 passi"}, "done": ["steps"], "pending": 1}},
    }
    d.update(kw)
    return d


# Monday 9 Nov 2026; Rome is UTC+1.
def at(hh, mm, day=9):
    return datetime(2026, 11, day, hh - 1, mm, tzinfo=timezone.utc)


def test_sends_due_reminder_with_label():
    out = due_pushes(device(), set(), at(17, 31))
    assert [(p.rule_id, p.body) for p in out] == [("w", "Oggi: Upper A")]


def test_skips_done_and_not_due_quests():
    assert due_pushes(device(), set(), at(19, 0)) == []  # steps already done
    d = device(days={"2026-11-09": {"due": {"steps": "x"}, "done": [], "pending": 1}})
    assert due_pushes(d, set(), at(17, 30)) == []  # no workout today


def test_catch_up_window_and_already_sent():
    assert due_pushes(device(), set(), at(17, 44))
    assert due_pushes(device(), set(), at(17, 46)) == []
    assert due_pushes(device(), {("w", "2026-11-09")}, at(17, 35)) == []


def test_silent_without_a_plan_for_today_and_in_quiet_hours():
    assert due_pushes(device(days={}), set(), at(17, 31)) == []
    d = device()
    d["rules"][0]["time"] = "23:00"
    assert due_pushes(d, set(), at(23, 1)) == []


def test_streak_and_weekly_summary():
    assert [p.body for p in due_pushes(device(), set(), at(21, 30))] == ["1 quest aperte"]
    assert due_pushes(device(), set(), at(20, 0)) == []  # Monday
    sunday = device(days={})
    assert [p.rule_id for p in due_pushes(sunday, set(), at(20, 1, day=15))] == ["z"]


def test_helpers():
    assert parse_hhmm("7:05").minute == 5 and parse_hhmm("x") is None
    assert in_quiet(parse_hhmm("23:00"), {"start": "22:30", "end": "07:00"})
    assert not in_quiet(parse_hhmm("12:00"), {"start": "22:30", "end": "07:00"})
    from datetime import date
    assert list(prune_days({"2026-11-01": {}, "2026-11-09": {}, "bad": {}}, date(2026, 11, 9))) == ["2026-11-09"]
