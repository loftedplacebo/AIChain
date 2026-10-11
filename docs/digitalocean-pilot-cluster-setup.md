# DigitalOcean pilot PostgreSQL setup

Historical setup record. Since 11 October 2026 the live synthetic pilot uses
Contabo PostgreSQL 17 on loopback port 5433. Do not rerun these managed test
bootstrap commands against the retained DigitalOcean rollback copy. See the
[production architecture cutover record](production-architecture-cutover-note.md)
for the current pilot binding and the planned production reuse of that cluster.

This is the operator record for the isolated, synthetic-data `test` cluster.
Do not put database passwords, connection URIs, API tokens or the downloaded CA
certificate in this file or Git. Partner data and access remain gated by the
hosted browser, least-privilege, backup and restore acceptance checks in
[the hosting plan](governance-storage-and-environments.md).

## Cluster and order

| Item | Recorded setting |
| --- | --- |
| Cluster name | `orvessian-pilot-test` |
| Cluster ID | `a4a72fa6-8316-4477-8838-59eba7adf8e2` |
| DigitalOcean project | `first-project` (may be reorganized later) |
| Engine | PostgreSQL 17, Standard Edition |
| Region | London LON1 |
| Plan | Basic shared CPU, Regular SSD, one primary, 1 vCPU, 2 GiB RAM, 30 GiB storage |
| Standby | None; this is not a highly available cluster |
| Storage autoscaling | Off at creation |
| Displayed recurring rate | $30.45/month, prorated at $0.045/hour; verify actual billing separately |
| VPC | `default-lon1`; the Contabo VPS will use the public database endpoint with a trusted-source rule |
| Public endpoint | `orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com:25060` |
| Connection limit | 47, as displayed on the cluster Settings page |
| Upgrade window | Friday after 3AM–7AM BST, as displayed on the cluster Settings page; required upgrades are automatic |

## Configuration log — 3 October 2026

1. The owner created the cluster from the DigitalOcean Control Panel. At first
   inspection its status was `CREATING`; the page showed PostgreSQL 17, LON1,
   the 2 GiB/30 GiB primary-only configuration and the rate above.
2. After provisioning completed, Network Access had no trusted sources and
   said the cluster was open to incoming connections. Added the sole trusted
   source `62.171.161.32/32`, described as the Orvessian pilot Contabo VPS
   `vmi3235919`. The Network Access page then displayed only that rule and
   stated that inbound connections are limited to specified sources. Do not
   add a broad CIDR or a temporary laptop IP unless a specific operator
   connection requires it; remove temporary sources after use.
3. Created the separate `governance_test` database. The provider's `defaultdb`
   and `doadmin` remain for administration; neither is the API runtime target.
4. Created DigitalOcean users `governance_api`,
   `governance_evidence_worker` and `governance_migrations`. Passwords are
   provider-generated and are not recorded in this file. DigitalOcean gives
   new users minimal permissions initially; SQL grants, RLS checks and a
   verified-TLS application connection remain to be done.
5. Saved four separate Database items in the owner's 1Password Personal vault:
   `Orvessian DigitalOcean PostgreSQL - doadmin`,
   `Orvessian DigitalOcean PostgreSQL - governance_api`,
   `Orvessian DigitalOcean PostgreSQL - governance_evidence_worker`, and
   `Orvessian DigitalOcean PostgreSQL - governance_migrations`. Each item
   records the public endpoint, port, database, username and provider-generated
   password. The three service items target `governance_test`; the admin item
   targets `defaultdb`. All four saved items were verified in the vault with
   their password fields masked. These are recovery/operator records, not yet
   deployed runtime secrets.
6. Downloaded the Standard Edition project CA from the cluster Overview. Its
   PEM parsed as an X.509 certificate (`CN=f0e0ecb3-50ae-43cd-8ba4-3b0cc8db2281
   Project CA`, valid until 30 September 2036). Kept the local copy in ignored
   `C:/AIChain/.env.digitalocean-ca.crt` and installed it on the VPS at
   `/etc/aichain/governance/digitalocean-ca.crt` (mode `0644`). The VPS copy's
   SHA-256 certificate fingerprint is
   `B8:49:E1:E6:DA:8E:15:86:B3:80:06:34:98:9D:D6:2D:13:BB:A6:85:80:E7:C6:16:2D:08:C9:EA:E4:28:C7:BE`.
   A credential-free `openssl s_client -starttls postgres` connection from the
   allowlisted VPS verified the endpoint hostname and CA with return code 0.
   This proves network reachability and server identity, not database login.
7. Reviewed the nineteen SQL migrations and strict API/worker grant templates.
   Prepared [the test-only bootstrap SQL](../deploy/governance/digitalocean-test-bootstrap.sql)
   to grant database connection, migration schema creation and runtime schema
   usage; no broad table defaults are granted. Staged it, the migration runner,
   all nineteen migrations, both runtime grant files and the interactive
   [apply script](../deploy/governance/digitalocean-test-apply.sh) under
   `/opt/aichain/governance-pilot-db-setup/` on the VPS. The staged scripts
   passed Bash/Node syntax checks and their file hashes and migration count
   matched the local copies. The owner ran it in PowerShell with the command
   below and entered the four matching 1Password database passwords at hidden
   prompts. No passwords were written to a setup file.

   ```powershell
   ssh -tt root@62.171.161.32 /opt/aichain/governance-pilot-db-setup/digitalocean-test-apply.sh
   ```

   The script connects with `verify-full`, applies the bootstrap SQL as
   `doadmin`, applies and verifies nineteen migrations as
   `governance_migrations`, applies both grant files in one transaction, then
   checks the API and evidence-worker privilege profiles using their separate
   credentials. It does not start either service.
8. The interactive setup completed successfully. The terminal showed the
   bootstrap transaction committed, `Applied and verified 19 test migrations`,
   both grant files applied, `api runtime privilege profile verified`,
   `evidence-worker runtime privilege profile verified`, and the final success
   message. The SSH session closed normally. This verifies authenticated
   `verify-full` connections, migration checksums and the repository's runtime
   permission profiles on this managed cluster. No API or worker service was
   started or pointed at this database.

## Remaining setup and acceptance

Current checkpoint — 4 October 2026: the hosted operator portal/API now use
this managed cluster with restricted credentials. The public synthetic submit
returned HTTP 201 and appeared in the portal. Encrypted B2 upload and an
authenticated, reviewed restore into a new **closed database in this same
cluster** passed. The evidence worker, independently verified hosted receipt,
key-revocation rehearsal and complete lost-cluster recovery are still open.

- [x] Confirm status is online and restrict Network Access to the VPS address.
- [x] Create the separate `governance_test` database.
- [x] Create non-owner API, evidence-worker and migration users. Use `doadmin`
  only for reviewed administration; its
  `BYPASSRLS` role is unsafe for either runtime.
- [x] Download and install the cluster CA, then verify the VPS-to-cluster TLS
  handshake with certificate chain and hostname verification.
- [x] Apply the nineteen migrations and reviewed grants/RLS checks using
  verified TLS (`sslmode=verify-full`) and the installed DigitalOcean CA.
- [x] Save the four provider-generated credentials in the owner's 1Password
  Personal vault, without putting passwords in Git.
- [x] Provision the restricted API runtime secret file on the VPS; keep the
  provider and 1Password references in the ignored inventory. The API does not
  use `doadmin`.
- [x] Pass API preflight, hosted synthetic submission, encrypted PostgreSQL
  capture and B2 upload, followed by authenticated fresh-target restore and
  review with access revoked/closed in the existing managed cluster.
- [x] Provision and accept separate evidence-worker runtimes and journals for
  two synthetic projects, signed receipts and independent Base Sepolia
  verification against the hosted managed-provider path. Both journals passed
  an authenticated, closed same-cluster B2 restore on 6 October; see the
  [Stage C rollout](deployments/stage-c-vps-rollout-2026-10-06.md).
- [ ] Before production recovery claims, rehearse restored-worker access
  invalidation and controlled publisher release against the replacement
  managed-provider path.
- [ ] Rehearse replacing an unavailable cluster and activating a reviewed
  restored service before claiming the full recovery-time target.

DigitalOcean documents [trusted sources and TLS](https://docs.digitalocean.com/products/databases/postgresql/how-to/secure/)
and [user/database creation](https://docs.digitalocean.com/products/databases/postgresql/how-to/manage-users-and-databases/).
