# Later production app move from Contabo to a dedicated VM

## Initial release

The production portal, API and evidence workers may run on the existing
Contabo VPS while the synthetic pilot continues there. Production uses the
exclusive `governance_prod` database on the existing DigitalOcean managed
cluster. This saves the cost of a second application VM at initial launch,
but test and production share Contabo CPU, memory, disk, network and root
administration. That shared failure domain must be included in the owner
go/no-go decision and customer availability claims.

Before admitting production traffic, use distinct production Unix users,
root-owned release directories, systemd units, protected environment files,
loopback ports, HTTPS routes, WorkOS Production credentials, database logins,
worker journals, signing/relayer keys, B2 backup account and encryption key,
and environment-specific health alerts. Confirm a synthetic pilot release,
restart and backup cannot alter production state. Measure both workloads
together with spare capacity and a rollback path. Do not run the production
worker until its chain and custody decision has passed.

## Trigger for a dedicated VM

Review the move after the first paying customers, or earlier if Contabo
capacity, fault isolation, privileged access, maintenance or a customer
availability commitment requires it. The move adds a VM charge, but does
not require a new managed database subscription or migration of customer
database rows.

## Controlled move

1. Build and verify the same pinned portal, API and worker release on the new
   VM. Create fresh production service identities and protected settings;
   retain the WorkOS Production client and public callback domains. Set up
   its firewall, TLS edge, monitoring and separate production backup path.
2. Add the new VM as a reviewed DigitalOcean database trusted source. Prove
   its restricted API and worker database connections and deny administrator
   credentials in services. Keep the Contabo source permitted only for the
   short cutover window.
3. Stop production writes and the production publisher on Contabo. Take a
   coordinated encrypted production database and worker-journal backup,
   authenticate it independently, and check pending evidence, signer,
   relayer nonce and revocation state. Move any durable journal or key material
   through a reviewed encrypted transfer; never copy pilot material.
4. Start one production publisher on the new VM, run private readiness and a
   bounded customer journey, then switch `prod.orvessian.com` and
   `api-prod.orvessian.com` to the new edge. Recheck WorkOS callback, webhook,
   receipt verification and monitoring. Avoid two active publishers using the
   same relayer or journal.
5. Remove the old Contabo production database trusted source and secrets only
   after the new VM's backup, alerts and recovery checks pass. Keep a short,
   explicit rollback window; rollback requires stopping the new publisher and
   reconciling writes and journals before restarting the old one.

The first release stays closed until its own production backup and
replacement-cluster restore, identity, security, capacity and evidence-chain
gates pass. This migration plan is a later procedure, not approval to switch
customer traffic now.
