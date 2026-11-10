"""Stripe webhook signature verification. Needs no network, so tests exercise the real code
with payloads signed against a test `whsec_` secret."""

import json
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import stripe


class SignatureError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class WebhookEvent:
    id: str
    type: str
    object: dict[str, Any]  # event.data.object, as plain JSON


def verify_event(payload: bytes, sig_header: str | None, secrets: Sequence[str]) -> WebhookEvent:
    """Accept the event if any configured secret (platform, then Connect) signed it."""
    if not sig_header or not secrets:
        raise SignatureError("missing signature or no webhook secret configured")
    for secret in secrets:
        try:
            stripe.Webhook.construct_event(payload, sig_header, secret)
        except stripe.SignatureVerificationError:
            continue
        except ValueError as exc:
            raise SignatureError("malformed payload") from exc
        break
    else:
        raise SignatureError("no webhook secret matched the signature")

    try:
        raw = json.loads(payload)
        obj = raw["data"]["object"]
        event = WebhookEvent(id=str(raw["id"]), type=str(raw["type"]), object=dict(obj))
    except (ValueError, KeyError, TypeError) as exc:
        raise SignatureError("malformed event") from exc
    return event
