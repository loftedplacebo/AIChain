"""Prepare and submit three content-free records for a supervised test pilot.

Run `prepare PATH` once, then `submit PATH` with the same file for retries.
Required environment: ORVESSIAN_TENANT, ORVESSIAN_PROJECT; submit also needs
ORVESSIAN_API_URL and ORVESSIAN_API_KEY. Never commit the generated file or key.
"""
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

REF = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
KINDS = ("ai.run.completed", "ai.run.completed", "ai.monitor.alerted")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def scope():
    tenant = os.environ["ORVESSIAN_TENANT"]
    project = os.environ["ORVESSIAN_PROJECT"]
    if not REF.fullmatch(tenant) or not REF.fullmatch(project):
        raise ValueError("Use bounded tenant and project references from the portal")
    return tenant, project


def build_manifest(tenant, project, batch, timestamp):
    stream = "pilot-stream-" + batch
    source = {"kind": "customer-sdk", "integrationVersion": "pilot-synthetic-0.1.0", "keyRef": "pilot-synthetic-key"}

    def base(index, kind):
        return {"schema": "aichain.governance-event", "schemaVersion": "0.1.0-draft",
                "profile": "urn:aichain:profile:enterprise-agent", "tenantRef": tenant,
                "projectRef": project, "environment": "test", "eventId": f"pilot-{index}-{batch}",
                "streamRef": stream, "sequence": str(index), "occurredAt": timestamp,
                "receivedAt": timestamp, "eventType": kind, "source": source,
                "agentRef": "synthetic-pilot-agent"}

    model = {"providerRef": "synthetic", "modelRef": "pilot-example",
             "deploymentRef": "pilot-test", "configVersion": "v1"}
    normal = base(1, KINDS[0])
    normal.update(runRef="pilot-normal-run-" + batch, caseRef="pilot-normal-case-" + batch,
                  model=model, activity={"taskClass": "pilot-synthetic-review", "latencyMs": 100},
                  result={"status": "completed", "predictedLabel": "approved"})
    unresolved = base(2, KINDS[1])
    unresolved.update(runRef="pilot-unresolved-run-" + batch,
                      caseRef="pilot-unresolved-case-" + batch, model=model,
                      activity={"taskClass": "pilot-synthetic-review", "latencyMs": 120},
                      result={"status": "pending"})
    exception = base(3, KINDS[2])
    exception.update(runRef=unresolved["runRef"], parentEventRefs=[unresolved["eventId"]],
                     monitor={"monitorRef": "pilot-synthetic-check",
                              "signalCode": "pilot-review-required", "severity": "medium",
                              "disposition": "open"})
    return {"kind": "orvessian-pilot-synthetic-set", "version": 1,
            "tenantRef": tenant, "projectRef": project,
            "events": [normal, unresolved, exception]}


def prepare(target):
    tenant, project = scope()
    timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    manifest = build_manifest(tenant, project, uuid.uuid4().hex, timestamp)
    with target.open("x", encoding="utf-8") as output:
        json.dump(manifest, output, indent=2)
        output.write("\n")
    print("Prepared synthetic set at", target)
    for event in manifest["events"]:
        print(event["eventType"], event["eventId"])


def api_origin():
    api = os.environ["ORVESSIAN_API_URL"].rstrip("/")
    url = urlsplit(api)
    if (not url.hostname or url.username or url.password or url.query or url.fragment
            or url.path not in ("", "/")
            or not (url.scheme == "https" or
                    (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1")))):
        raise ValueError("Use the supplied HTTPS API origin or a loopback test origin")
    return api


def submit(target):
    tenant, project = scope()
    if target.is_symlink() or not target.is_file() or target.stat().st_size > 65536:
        raise ValueError("Use the original regular synthetic set file (at most 64 KiB)")
    manifest = json.loads(target.read_text(encoding="utf-8"))
    if (not isinstance(manifest, dict) or manifest.get("kind") != "orvessian-pilot-synthetic-set"
            or manifest.get("version") != 1 or manifest.get("tenantRef") != tenant
            or manifest.get("projectRef") != project or not isinstance(manifest.get("events"), list)
            or len(manifest["events"]) != 3):
        raise ValueError("Synthetic set identity or scope does not match this project")
    events = manifest["events"]
    if not isinstance(events[0], dict):
        raise ValueError("Synthetic set was changed or is outside the test project")
    match = re.fullmatch(r"pilot-1-([0-9a-f]{32})", str(events[0].get("eventId")))
    timestamp = events[0].get("occurredAt")
    if not match or not isinstance(timestamp, str) or manifest != build_manifest(tenant, project, match.group(1), timestamp):
        raise ValueError("Synthetic set was changed or is outside the test project")
    api = api_origin()
    key = os.environ["ORVESSIAN_API_KEY"]
    if not key:
        raise ValueError("A scoped project API key is required")
    opener = build_opener(NoRedirect())
    for event in events:
        payload = json.dumps(event, separators=(",", ":")).encode("utf-8")
        request = Request(api + "/v1/events", data=payload,
                          headers={"Authorization": "Bearer " + key,
                                   "Content-Type": "application/json"}, method="POST")
        try:
            with opener.open(request, timeout=10) as response:
                body = response.read(65537)
                if len(body) > 65536:
                    raise ValueError("API response exceeds 64 KiB")
                acknowledgement = json.loads(body)
                if (response.status not in (200, 201)
                        or acknowledgement.get("eventId") != event["eventId"]
                        or acknowledgement.get("status") not in ("accepted", "duplicate")):
                    raise ValueError("API acknowledgement did not match the synthetic event")
                print(event["eventId"], acknowledgement["status"])
        except HTTPError as error:
            raise ValueError(f"API returned HTTP {error.code} for {event['eventId']}") from None
        except URLError:
            raise ValueError(f"API request failed for {event['eventId']}; retry the same file") from None


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("prepare", "submit"):
        raise ValueError("Usage: python design-partner-synthetic-set.py prepare|submit PATH")
    target = Path(sys.argv[2]).absolute()
    if sys.argv[1] == "prepare":
        prepare(target)
    else:
        submit(target)


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print("Synthetic pilot set failed:", error, file=sys.stderr)
        sys.exit(1)
