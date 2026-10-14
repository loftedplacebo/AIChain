# Production shared-host baseline — 14 October 2026

This is a point-in-time prelaunch observation at 17:32 UTC. Production
customer routes were closed, the portal was inactive, and no Production
project or evidence worker existed. It is not a load test or a customer
capacity promise.

| Resource | Observed state |
| --- | --- |
| Contabo host | 12 logical CPUs; 50,514,550,784 bytes total RAM; 48,215,031,808 bytes available RAM; no swap |
| Contabo root filesystem | 258,906,374,144 bytes total; 229,647,409,152 bytes available (12% used) |
| Production API | Active, enabled, `orvessian-prod-api`; 20,533,248 bytes service memory; 512 MiB `MemoryMax`; one CPU quota |
| Production portal | Disabled and inactive, `orvessian-prod-portal`; 512 MiB `MemoryMax`; one CPU quota |
| Synthetic pilot API and portal | Active and enabled; 43,646,976 and 51,679,232 bytes service memory respectively; each has a 512 MiB memory limit and one CPU quota |
| Existing DigitalOcean managed PostgreSQL | `governance_prod` only in the named inventory, 9,328,307 bytes; 50 maximum connections, three reserved, 11 current cluster connections and zero observed Production database connections |

The read-only managed inventory ran through
`inspect-managed-cluster-for-production.py`; host observations came from
`free -b`, `df -B1`, `nproc` and `systemctl show`. The database inventory
also showed the restricted Production API login and two `NOLOGIN` migration
and worker roles. Connection counts can change between samples.

The repeatable [isolation audit](../deploy/governance/audit-production-host-isolation.py)
passed on the live VPS. It checked four expected service users and states,
root-only mode `0600` on five pilot/Production credential files, and denied
cross-environment read access for the four service identities. It reads no
secret values. This proves the checked Unix file-access boundaries at that
time. It does not prove resistance to root compromise, shared-host outages,
pilot resource saturation, or a Production worker boundary that does not yet
exist.

Before an owner capacity or availability decision, measure concurrent pilot
and Production traffic, PostgreSQL pool demand, CPU, memory, disk write
latency, receipt delay and recovery during a bounded load window. Confirm
the Production worker's limits after its chain and custody decision. Keep the
shared Contabo failure domain in the release decision.
