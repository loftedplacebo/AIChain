# Repository release gates for the synthetic pilot

The API/worker source and portal source are separate Git repositories. Each now
has a workflow definition for an independent build gate before a reviewed
hosted change:

- The main repository's
  [pilot release gate](../.github/workflows/pilot-release-gate.yml) checks
  WorkOS sessions and revocation, project keys, project/worker inventory,
  backup marker coverage and the bounded capacity assessment.
- The portal repository's `.github/workflows/portal-release-gate.yml` runs its
  full `npm test` command, including TypeScript checking, a production build
  and its browser gateway/rendering tests.

These are source checks. They do not deploy to the VPS, prove hosted receipt
publication or authorize a larger pilot project cap. A release record must
identify the exact commit in each repository, the matching built artifacts,
their SHA-256 digests, the target environment and the prior revision to restore.
The operator then applies the reviewed activation, verifies public and internal
health, one scoped synthetic receipt and backup coverage, and keeps the prior
artifact until rollback is no longer needed. The current hosted activation
scripts remain component-specific; a single repeatable deployment/rollback
entry point is still needed before Production.

The portal repository is not nested source controlled by the main repository:
its workflow and commit must be checked independently. A main-repository green
run does not imply a portal green run, or vice versa.

The main repository is currently ahead of its GitHub remote, and the portal's
primary remote is the Sites Git service rather than GitHub. The workflow files
become remotely enforced checks only after their relevant refs are published
to a GitHub repository with Actions enabled and branch protection configured.
Until then, run the named test commands locally and record their results with
the exact source revisions. Do not describe the unpushed workflows as a live
deployment gate.
