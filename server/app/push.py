"""Sending one Web Push message (VAPID)."""

from __future__ import annotations

import json
import logging

log = logging.getLogger("push")


class Gone(Exception):
    """The browser dropped this subscription (app uninstalled, permission revoked)."""


def send(subscription: dict, payload: dict, private_key: str, subject: str) -> None:
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims={"sub": subject},
            ttl=3600,
        )
    except WebPushException as e:  # pragma: no cover - network
        status = getattr(e.response, "status_code", None)
        if status in (404, 410):
            raise Gone from e
        log.warning("push failed with status %s", status)
        raise
