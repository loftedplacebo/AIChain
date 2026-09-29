# Governance webhook delivery — local alpha

28 September 2026. The action integration now has a persistent SQLite delivery
journal and a bounded one-job runner in
[`webhook-delivery.cjs`](../services/governance/webhook-delivery.cjs). It is not
connected to a public destination-management API, incident rules, a running
notification daemon or PostgreSQL. No external notification was sent during
development. Tests use a local HTTP receiver and synthetic references.

## Producer and authorization boundary

A trusted service producer supplies an incident/event reference, severity and
stable delivery ID. The journal enforces matching tenant/project scope, rejects
changed payload or destination/key bindings under the same ID and limits each
project to 10,000 nonterminal jobs. Source text, conversations, model outputs and
free-form incident descriptions are rejected by the signed-envelope schema.
The envelope contains only schemaVersion, deliveryId, tenantRef, projectRef,
incidentRef, eventRef and severity. This message announces a reference; the
recipient needs separate authorized portal/API access to investigate it.

Principals passed to this module must already be authenticated by the caller.
This library is not an authentication boundary. Destination references resolve
only through trusted operator configuration scoped to the same tenant/project;
customer-submitted event fields cannot provide URLs. Preserve immutable endpoint
references when changing URLs: a destination reference must not silently retarget
pending jobs. A distinct delivery ID is required for each destination.

Keys are obtained at delivery from an injected resolver using persisted keyRef,
principal and destinationRef. No key is stored in the journal. Bind key references
to a destination/project in the resolver, retain old versions for queued jobs and
explicitly revoke compromised versions. Destination provisioning/approval,
rotation UI and managed-secret deployment remain release work.

## Delivery and recovery

`DeliveryJournal.enqueue(principal, envelope, binding)` persists a job; repeatedly
enqueuing exactly the same binding/body is a no-op. `deliverOne` claims one due job
in a SQLite transaction with a 60-second lease and random fencing token. Another
worker cannot claim that live lease. Expired leases can be reclaimed; a stale
worker cannot overwrite the new claim's state. At most eight claims are allowed,
including claims interrupted by process failure. Exhaustion enters `dead`.

2xx responses mark delivered. Transport/configuration failures and HTTP
408/429/500/502/503/504 schedule bounded exponential retry from one second to
five minutes. Other statuses, including redirects, become dead letters. A caller
may schedule subsequent `deliverOne` calls through the opt-in local
`RuleProcessor` with an explicitly injected destination/key resolver. API startup
only schedules scans/publication when configured; it never enables delivery.
HTTP response bodies, exception text, destination URLs and key material are not
written to delivery status. `list(principal)` exposes a bounded first 100 jobs,
scoped to that principal; portal pagination/filtering and retry UI remain open.

Each attempt signs the same JSON body and stable delivery ID with a fresh
timestamp. Delivery is **at least once**: lost acknowledgements and process
failure after remote acceptance can repeat a notification. The receiver must
verify the exact bytes with `webhook-signatures.cjs`, enforce freshness, persist
delivery IDs transactionally with its side effect and acknowledge duplicates
without repeating the side effect. Signature freshness alone does not prevent
replay. Our local test receiver demonstrates deduplication, not a production
receiver storage implementation.

## Network restrictions

The default transport requires HTTPS on port 443 with TLS hostname/certificate
validation. It refuses embedded credentials, query strings and fragments, bounds
destination length, rejects redirects, resolves all DNS addresses on every
attempt and rejects private/special-use IPv4 or mixed/IPv6 results. The selected
public IPv4 address is pinned into the request lookup so later DNS changes cannot
redirect that attempt. IPv6-only and dual-stack destinations are currently
unsupported; add tested IPv6 egress policy before enabling them. Apply independent
deployment egress controls as well as this library policy before production.

DNS has a five-second deadline; the HTTP request has a ten-second deadline and
response body limit of 64 KiB. These are below the claim lease duration. The
explicit `testLoopback` transport option permits only literal 127.0.0.1 HTTP for
local tests. It must never be selected by production/customer configuration.
Injectable transport/key resolvers are trusted application code, not user options.

## Storage and release gates

SQLite WAL with FULL synchronous commits protects committed jobs across process
restart. Protect the database using restricted OS access and encrypted storage.
Terminal jobs remain for idempotency; retention, archival, bounded disk use and
audited dead-letter recovery need a policy before sustained deployment. Backups
must include this journal and receiver dedupe state; it is not part of the
existing governance database backup automatically. PostgreSQL migration, capacity
testing, observability, destination registration and rules/incident integration
remain mandatory before advertising automatic customer alerts.

## Validation

```text
node --test services/governance/webhook-signatures.test.cjs services/governance/webhook-delivery.test.cjs
```

Four tests pass: signed local receiver, initial 503 retry, SQLite restart,
lost acknowledgement with unchanged payload and receiver deduplication, tenant
isolation, conflicting identity, lease fencing, eight-claim retry/crash exhaustion,
permanent rejection, foreign destination exclusion, private/special/IPv6 egress
denial and signature tamper/freshness checks. Public HTTPS delivery and production
destination provisioning are not validated by the local receiver test.
