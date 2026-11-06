"""Settings, read once from the environment (see .env.example)."""

import os
from dataclasses import dataclass, field


def _list(value: str) -> list[str]:
    return [x.strip() for x in value.split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    env: str = field(default_factory=lambda: os.environ.get("APP_ENV", "production"))
    database_url: str = field(default_factory=lambda: os.environ.get("DATABASE_URL", ""))
    vapid_public_key: str = field(default_factory=lambda: os.environ.get("VAPID_PUBLIC_KEY", ""))
    vapid_private_key: str = field(default_factory=lambda: os.environ.get("VAPID_PRIVATE_KEY", ""))
    vapid_subject: str = field(default_factory=lambda: os.environ.get("VAPID_SUBJECT", ""))
    register_key: str = field(default_factory=lambda: os.environ.get("REGISTER_KEY", ""))
    cron_secret: str = field(default_factory=lambda: os.environ.get("CRON_SECRET", ""))
    allowed_origins: list[str] = field(default_factory=lambda: _list(os.environ.get("ALLOWED_ORIGINS", "https://senseibonsai2k.github.io")))
    sentry_dsn: str = field(default_factory=lambda: os.environ.get("SENTRY_DSN", ""))

    @property
    def dev(self) -> bool:
        return self.env == "development"


def get_settings() -> Settings:
    return Settings()
