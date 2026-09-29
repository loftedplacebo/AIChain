export function firstSubmissionPython(tenantRef,projectRef){
 if([tenantRef,projectRef].some(v=>typeof v!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(v)))throw Error('Authenticated project references required');
 return `import json, os, uuid
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import Request, HTTPRedirectHandler, build_opener

# Never forward the API key to a redirected endpoint.
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = build_opener(NoRedirect())

# Set these in your application environment; never put the key in source control.
api = os.environ["ORVESSIAN_API_URL"].rstrip("/")
url = urlparse(api)
if (not url.hostname or url.username or url.password or url.query or url.fragment
    or url.path not in ("", "/")
    or not (url.scheme == "https" or
            (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1")))):
    raise ValueError("Use your supplied HTTPS API origin or a loopback test origin")

# One synthetic record: this does not call an AI model or submit source content.
event = {
    "schema": "aichain.governance-event",
    "schemaVersion": "0.1.0-draft",
    "profile": "urn:aichain:profile:enterprise-agent",
    "tenantRef": "${tenantRef}",
    "projectRef": "${projectRef}",
    "environment": "test",
    "eventId": "synthetic-first-" + uuid.uuid4().hex,
    "runRef": "synthetic-run-" + uuid.uuid4().hex,
    "streamRef": "synthetic-stream-" + uuid.uuid4().hex,
    "sequence": "1",
    "occurredAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    "eventType": "ai.run.completed",
    "source": {"kind": "customer-sdk", "integrationVersion": "portal-quickstart-0.1.0", "keyRef": "onboarding-key"},
    "agentRef": "synthetic-onboarding-agent",
    "model": {"providerRef": "synthetic", "modelRef": "onboarding-example", "deploymentRef": "onboarding-test", "configVersion": "1"},
    "activity": {"taskClass": "onboarding-test", "latencyMs": 100},
    "result": {"status": "completed"}
}
request = Request(api + "/v1/events", data=json.dumps(event).encode("utf-8"),
    headers={"Authorization": "Bearer " + os.environ["ORVESSIAN_API_KEY"],
             "Content-Type": "application/json"}, method="POST")
with opener.open(request, timeout=10) as response:
    body = response.read(65537)
    if len(body) > 65536:
        raise ValueError("API response exceeds the example's 64 KiB limit")
    print(response.status, body.decode("utf-8"))
print("Find this event in Decisions:", event["eventId"])

# If a response is lost, retry this SAME event object, not a new event ID.
`;
}
