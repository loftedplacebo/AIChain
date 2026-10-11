# Accelerated production cluster cutover evidence — 11 October 2026

The operator requested an on-demand backup to advance the production database cutover before the next unattended 03:00 UTC backup. The existing coordinated backup service completed at 14:40:49 UTC with backup ID `c79ba135-5b42-417e-b3bd-cd1955853f12`. Post-backup hosted and backup health checks passed.

The separate B2 Restore credential was entered at a hidden prompt by the operator. The independent drill found the completion marker, authenticated the download and archive, and restored it into closed local PostgreSQL 17 database `gov_restore_b2_a451c6e5b6b2`. Review passed for all registered evidence worker journals. Access was revoked and the restored database remains closed, with no service activated. The drill took 1.89 seconds.

The accelerated retirement preflight and dry run both reported ready. They target exactly six historical managed pilot databases and three historical pilot roles. The managed inventory reported zero active connections. The production database was not yet created at the time of this note.

The exact-object retirement subsequently completed. A fresh managed inventory showed zero pilot databases and roles. The reviewed production-only SQL created empty `governance_prod` and three restricted `NOLOGIN` roles; bootstrap and follow-up verification passed. A hosted pilot health check remained green with four covered projects and four active workers. The production database had zero connections at inspection.

This evidence supports the one-time cluster cutover gate. It does not replace the separate check that the unattended 03:00 UTC backup timer runs successfully on 12 October.
