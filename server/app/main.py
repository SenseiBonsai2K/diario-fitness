"""Diario Fitness push server.

The diary stays on the phone; this server only knows, per device, a push
subscription, the reminder rules (kind, local time, weekdays, text), quiet
hours and, for the next days, which quests are due and done. A cron (Supabase
pg_cron, every minute) calls /api/v1/tick, which sends what is due.
"""


import hmac
import logging
import secrets
import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import push as push_mod
from .config import Settings, get_settings
from .schedule import KINDS, due_pushes, local_now, prune_days
from .store import Store, hash_token, make_store, utcnow

log = logging.getLogger("diario-push")


# ── Errors: one envelope everywhere ──────────────────────────────────────
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, headers: dict | None = None):
        self.status, self.code, self.message, self.headers = status, code, message, headers or {}


def _error(status: int, code: str, message: str, details=None, headers=None) -> JSONResponse:
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return JSONResponse(body, status_code=status, headers=headers)


# ── Rate limiting (in memory: one small instance) ────────────────────────
class RateLimiter:
    def __init__(self) -> None:
        self.hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str, limit: int, per_seconds: int) -> None:
        now = time.monotonic()
        q = self.hits[key]
        while q and q[0] <= now - per_seconds:
            q.popleft()
        if len(q) >= limit:
            retry = int(per_seconds - (now - q[0])) + 1
            raise ApiError(429, "rate_limited", "Too many requests.", {"Retry-After": str(retry)})
        q.append(now)


# ── Request / response models ─────────────────────────────────────────────
class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class Subscription(BaseModel):
    endpoint: str = Field(max_length=1000, pattern=r"^https://")
    keys: Keys
    expirationTime: float | None = None


class Rule(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    kind: str = Field(description="workout, steps, weigh, water, sleep, diet, check, backup, streak or summary")
    time: str = Field(pattern=r"^\d{2}:\d{2}$", examples=["19:00"], description="Local time, HH:MM")
    days: list[int] = Field(default_factory=lambda: list(range(7)), max_length=7, description="0 = Sunday … 6 = Saturday")
    enabled: bool = True
    title: str = Field(max_length=80)
    body: str = Field(max_length=200, description="May contain {label}: what is still due (e.g. the session name)")


class Quiet(BaseModel):
    start: str = Field(pattern=r"^\d{2}:\d{2}$", examples=["22:30"])
    end: str = Field(pattern=r"^\d{2}:\d{2}$", examples=["07:00"])


class DayPlan(BaseModel):
    due: dict[str, str] = Field(default_factory=dict, max_length=20, description="quest key → label")
    done: list[str] = Field(default_factory=list, max_length=20)
    pending: int = Field(0, ge=0, le=50, description="Required quests still open")


class RegisterIn(BaseModel):
    subscription: Subscription
    timezone: str = Field("Europe/Rome", max_length=60)


class RegisterOut(BaseModel):
    id: str
    token: str = Field(description="Keep it on the phone: every later call needs it (Authorization: Bearer …)")


class SyncIn(BaseModel):
    subscription: Subscription | None = None
    timezone: str | None = Field(None, max_length=60)
    rules: list[Rule] = Field(default_factory=list, max_length=30)
    quiet: Quiet | None = None
    days: dict[str, DayPlan] = Field(default_factory=dict, max_length=14, description="YYYY-MM-DD → plan")


class DeviceOut(BaseModel):
    id: str
    rules: int
    days: int
    timezone: str


def create_app(settings: Settings | None = None, store: Store | None = None, sender=None) -> FastAPI:
    settings = settings or get_settings()
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.env, send_default_pii=False, traces_sample_rate=0.0)
    store = store or make_store(settings.database_url)
    if not settings.database_url and not settings.dev:
        log.warning("DATABASE_URL is not set: devices are kept in memory and lost on restart")
    sender = sender or (lambda sub, payload: push_mod.send(sub, payload, settings.vapid_private_key, settings.vapid_subject))
    limiter = RateLimiter()

    app = FastAPI(
        title="Diario Fitness push",
        version="1.0.0",
        docs_url="/docs" if settings.dev else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.dev else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins + (["http://localhost:5173"] if settings.dev else []),
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Register-Key"],
        allow_credentials=False,
        max_age=600,
    )

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, e: ApiError):
        return _error(e.status, e.code, e.message, headers=e.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        details = [{"field": ".".join(str(x) for x in err["loc"][1:]), "issue": err["msg"]} for err in e.errors()]
        return _error(422, "validation_error", "Some fields are not valid.", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(e.status_code, "http_error")
        return _error(e.status_code, code, "Not found." if e.status_code == 404 else "Request not allowed.")

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, e: Exception):  # pragma: no cover - safety net
        log.exception("unhandled error")
        return _error(500, "server_error", "Something went wrong.")

    def client_ip(request: Request) -> str:
        fwd = request.headers.get("x-forwarded-for", "")
        return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")

    def device_auth(device_id: str, authorization: Annotated[str | None, Header()] = None) -> dict:
        token = (authorization or "").removeprefix("Bearer ").strip()
        d = store.get_device(device_id)
        if not d or not token or not hmac.compare_digest(d["token_hash"], hash_token(token)):
            raise ApiError(404, "not_found", "Device not found.")  # same answer for "wrong token" and "no such device"
        limiter.check(f"dev:{device_id}", 120, 3600)
        return d

    @app.get("/api/v1/health", tags=["health"], summary="Liveness check")
    def health():
        return {"status": "ok"}

    @app.get("/api/v1/push/key", tags=["push"], summary="VAPID public key for subscribing")
    def public_key():
        if not settings.vapid_public_key:
            raise ApiError(503, "not_configured", "Push is not configured on the server.")
        return {"publicKey": settings.vapid_public_key}

    @app.post("/api/v1/devices", tags=["devices"], status_code=201, response_model=RegisterOut, summary="Register this phone",
              description="Needs the server's registration key (X-Register-Key), so only its owner can add devices.")
    def register(body: RegisterIn, request: Request, x_register_key: Annotated[str | None, Header()] = None):
        limiter.check(f"reg:{client_ip(request)}", 10, 3600)
        if not settings.register_key or not hmac.compare_digest(settings.register_key, x_register_key or ""):
            raise ApiError(401, "bad_register_key", "Registration key is missing or wrong.")
        token = secrets.token_urlsafe(32)
        did = store.create_device(hash_token(token), body.subscription.model_dump(), body.timezone)
        return RegisterOut(id=did, token=token)

    @app.put("/api/v1/devices/{device_id}", tags=["devices"], response_model=DeviceOut, summary="Update rules, quiet hours and the next days")
    def sync(body: SyncIn, device: Annotated[dict, Depends(device_auth)]):
        tz = body.timezone or device.get("timezone") or "Europe/Rome"
        today = local_now(tz, utcnow()).date()
        rules = [r.model_dump() for r in body.rules if r.kind in KINDS]
        values = {
            "timezone": tz,
            "rules": rules,
            "quiet": body.quiet.model_dump() if body.quiet else None,
            "days": prune_days({k: v.model_dump() for k, v in body.days.items()}, today),
        }
        if body.subscription:
            values["subscription"] = body.subscription.model_dump()
        store.update_device(device["id"], values)
        return DeviceOut(id=device["id"], rules=len(rules), days=len(values["days"]), timezone=tz)

    @app.post("/api/v1/devices/{device_id}/test", tags=["devices"], summary="Send a test notification now")
    def test(device: Annotated[dict, Depends(device_auth)], title: str = "Diario Fitness", body: str = "Notifiche attive"):
        limiter.check(f"test:{device['id']}", 5, 300)
        if not device.get("subscription"):
            raise ApiError(409, "no_subscription", "This device has no push subscription.")
        try:
            sender(device["subscription"], {"title": title[:80], "body": body[:200], "tag": "test", "url": "./"})
        except push_mod.Gone:
            store.update_device(device["id"], {"subscription": None})
            raise ApiError(410, "subscription_gone", "The browser dropped this subscription: turn notifications on again.")
        return {"sent": 1}

    @app.delete("/api/v1/devices/{device_id}", tags=["devices"], status_code=204, summary="Forget this phone")
    def forget(device: Annotated[dict, Depends(device_auth)]):
        store.delete_device(device["id"])
        return Response(status_code=204)

    @app.post("/api/v1/tick", tags=["cron"], summary="Send the reminders due now (called every minute by the cron)")
    def tick(x_cron_secret: Annotated[str | None, Header()] = None):
        if not settings.cron_secret or not hmac.compare_digest(settings.cron_secret, x_cron_secret or ""):
            raise ApiError(401, "bad_cron_secret", "Cron secret is missing or wrong.")
        now = utcnow()
        sent = 0
        for device in store.active_devices():
            day = local_now(device.get("timezone") or "Europe/Rome", now).date().isoformat()
            for p in due_pushes(device, store.sent_on(device["id"], day), now):
                if not store.mark_sent(device["id"], p.rule_id, p.day):
                    continue  # another tick got there first
                try:
                    sender(device["subscription"], {"title": p.title, "body": p.body, "tag": p.tag, "url": "./"})
                    sent += 1
                except push_mod.Gone:
                    store.update_device(device["id"], {"subscription": None})
                    break
                except Exception:  # one failed push must not stop the others
                    log.exception("push failed")
        return {"sent": sent, "at": now.isoformat()}

    return app


app = create_app()
