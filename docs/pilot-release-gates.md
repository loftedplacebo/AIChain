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
artifact until rollback is no longer needed. For the VPS portal, use the
checksum-pinned `deploy/governance/release-pilot-portal.py` entry point. It
rejects unsafe archive members, stages the standalone build, moves the former
build to a release-specific previous directory, restarts the portal, checks
loopback HTTP, and restores the previous build if that check fails. An explicit
`rollback` command uses the retained previous directory. This covers the VPS
portal only; API, worker and database releases need their own reviewed paths.

After building a standalone portal archive and recording its SHA-256, copy it
and the reviewed release script to the VPS. The release ID must be unique and
contain lowercase letters, digits or hyphens. From a root shell on the VPS:

```sh
python3 /opt/aichain/governance-pilot-db-setup/release-pilot-portal.py \
  activate --archive /opt/aichain/portal-RELEASE.tar.gz \
  --sha256 EXPECTED_SHA256 --release-id RELEASE
python3 /opt/aichain/governance-pilot-db-setup/check-pilot-hosted-health.py
```

If post-release checks fail after activation reported success, restore the
retained build with:

```sh
python3 /opt/aichain/governance-pilot-db-setup/release-pilot-portal.py \
  rollback --release-id RELEASE
```

Keep the prior build and archive until the receipt and backup checks pass.
Never treat a green loopback check alone as complete release acceptance.

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

The [capacity wave record](pilot-capacity-waves.md) names the measured
two-project boundary and the admission checks required before each increase
from the current five-project cap.
