#!/usr/bin/env python3
"""Submit one synthetic pilot record using a hidden, one-time API-key prompt."""
import getpass
import json
import re
import secrets
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


if not sys.stdin.isatty():
    raise SystemExit("Run from an interactive SSH terminal")

api_key = getpass.getpass("1Password Hosted synthetic smoke test API key: ").strip()
if not re.fullmatch(r"ovk_[0-9a-f]{64}", api_key):
    if not api_key.startswith("ovk_"):
        raise SystemExit("Use the project's ovk_ secret from the 1Password credential field, not the key ID or WorkOS API key")
    raise SystemExit("Incomplete project API key; copy the entire ovk_ secret from 1Password")

suffix = lambda: secrets.token_hex(16)
event_id = "synthetic-first-" + suffix()
event = {
    "schema": "aichain.governance-event",
    "schemaVersion": "0.1.0-draft",
    "profile": "urn:aichain:profile:enterprise-agent",
    "tenantRef": "org-831aa048-b268-4fce-98f3-455429034ef8",
    "projectRef": "prj-d9109260-1232-4561-ab4a-ab2e5c8f658f",
    "environment": "test",
    "eventId": event_id,
    "runRef": "synthetic-run-" + suffix(),
    "streamRef": "synthetic-stream-" + suffix(),
    "sequence": "1",
    "occurredAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    "eventType": "ai.run.completed",
    "source": {"kind": "customer-sdk", "integrationVersion": "portal-quickstart-0.1.0", "keyRef": "onboarding-key"},
    "agentRef": "synthetic-onboarding-agent",
    "model": {"providerRef": "synthetic", "modelRef": "onboarding-example", "deploymentRef": "onboarding-test", "configVersion": "1"},
    "activity": {"taskClass": "onboarding-test", "latencyMs": 100},
    "result": {"status": "completed"},
}

request = Request(
    "https://api.orvessian.com/v1/events",
    data=json.dumps(event, separators=(",", ":")).encode("utf-8"),
    headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
    method="POST",
)
api_key = None
try:
    with build_opener(NoRedirect()).open(request, timeout=10) as response:
        body = response.read(65537)
        if len(body) > 65536 or response.status != 201:
            raise SystemExit("Synthetic submission returned an unexpected response")
        result = json.loads(body)
        if result.get("status") not in ("accepted", "created"):
            raise SystemExit("Synthetic submission was not accepted")
        print("Synthetic submission accepted: HTTP 201")
        print("Event ID:", event_id)
except HTTPError as error:
    raise SystemExit("Synthetic submission failed: HTTP " + str(error.code))
except URLError:
    raise SystemExit("Synthetic submission failed: network or TLS error")
