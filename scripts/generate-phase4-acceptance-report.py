#!/usr/bin/env python3
"""Produce a reviewed-metrics draft from Phase 4 observation files; never controls nodes."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
from pathlib import Path
from typing import Any


REQUIRED_FAULT_KINDS = {"partition", "restart", "reorg", "malformed-submission", "load"}


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot read {path}: {error}") from error
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[round((len(ordered) - 1) * fraction)]


def numeric_summary(values: list[object]) -> dict[str, float | int | None]:
    samples = [float(value) for value in values if isinstance(value, (int, float))]
    return {"samples": len(samples), "mean": statistics.mean(samples) if samples else None,
            "p50": percentile(samples, 0.5), "p95": percentile(samples, 0.95),
            "max": max(samples) if samples else None}


def resource_summary(path: Path) -> dict[str, Any]:
    data = read_json(path)
    records = data.get("records")
    if data.get("schema") != "aichain.kawpow-g3-resource-samples" or not isinstance(records, list):
        raise SystemExit(f"Unsupported resource sample schema: {path}")
    return {
        "sourceSha256": digest(path),
        "sampleCount": len(records),
        "cpuPercentOneCore": numeric_summary([row.get("cpuPercentOneCore") for row in records if isinstance(row, dict)]),
        "rssBytes": numeric_summary([row.get("VmRSS") for row in records if isinstance(row, dict)]),
        "dataDirBytes": numeric_summary([row.get("dataDirBytes") for row in records if isinstance(row, dict)]),
    }


def policy_value(policy: dict[str, Any], *keys: str) -> Any:
    value: Any = policy
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            raise SystemExit(f"Policy missing required field: {'.'.join(keys)}")
        value = value[key]
    return value


def evaluate_policy(policy_path: Path, policy: dict[str, Any], result: dict[str, Any], experiments: list[Any]) -> dict[str, Any]:
    if policy.get("schema") != "aichain.phase4-acceptance-policy" or policy.get("schemaVersion") != "0.1.0-draft":
        raise SystemExit("unsupported Phase 4 acceptance policy")
    checks: list[dict[str, Any]] = []
    missing: list[str] = []

    def check(identifier: str, actual: Any, limit: Any, passed: bool) -> None:
        checks.append({"id": identifier, "actual": actual, "limit": limit, "passed": passed})

    network = result["measurements"].get("network")
    if not network:
        missing.append("network-observation")
    else:
        blocks = int(network["endHeight"]) - int(network["startHeight"])
        block_timing = network.get("blockProductionMs") or {}
        propagation = network.get("propagationObservationMs") or {}
        check("network.minimum-observed-blocks", blocks, policy_value(policy, "network", "minimumObservedBlocks"),
              blocks >= policy_value(policy, "network", "minimumObservedBlocks"))
        check("network.mean-block-production-ms", block_timing.get("mean"),
              [policy_value(policy, "network", "minimumMeanBlockProductionMs"), policy_value(policy, "network", "maximumMeanBlockProductionMs")],
              isinstance(block_timing.get("mean"), (int, float)) and policy_value(policy, "network", "minimumMeanBlockProductionMs") <= block_timing["mean"] <= policy_value(policy, "network", "maximumMeanBlockProductionMs"))
        check("network.p95-block-production-ms", block_timing.get("p95"), policy_value(policy, "network", "maximumP95BlockProductionMs"),
              isinstance(block_timing.get("p95"), (int, float)) and block_timing["p95"] <= policy_value(policy, "network", "maximumP95BlockProductionMs"))
        check("network.p95-propagation-observation-ms", propagation.get("p95"), policy_value(policy, "network", "maximumP95PropagationObservationMs"),
              isinstance(propagation.get("p95"), (int, float)) and propagation["p95"] <= policy_value(policy, "network", "maximumP95PropagationObservationMs"))
        check("network.canonical-hash-agreement", network.get("canonicalHashAgreement"), policy_value(policy, "network", "requireCanonicalHashAgreement"),
              network.get("canonicalHashAgreement") is policy_value(policy, "network", "requireCanonicalHashAgreement"))

    for role, policy_prefix in (("minerResources", "maximumMiner"), ("validatorResources", "maximumValidator")):
        resources = result["measurements"].get(role)
        if not resources:
            missing.append(role)
            continue
        cpu = resources["cpuPercentOneCore"].get("p95")
        rss = resources["rssBytes"].get("max")
        check(f"resources.{role}.p95-cpu", cpu, policy_value(policy, "resources", f"{policy_prefix}P95CpuPercentOneCore"),
              isinstance(cpu, (int, float)) and cpu <= policy_value(policy, "resources", f"{policy_prefix}P95CpuPercentOneCore"))
        check(f"resources.{role}.max-rss", rss, policy_value(policy, "resources", f"{policy_prefix}RssBytes"),
              isinstance(rss, (int, float)) and rss <= policy_value(policy, "resources", f"{policy_prefix}RssBytes"))

    by_kind = {row.get("kind"): row for row in experiments if isinstance(row, dict)}
    load = by_kind.get("load")
    proof = by_kind.get("malformed-submission")
    if not isinstance(load, dict) or not isinstance(load.get("metrics"), dict):
        missing.append("load-metrics")
    else:
        metrics = load["metrics"]
        for key, policy_key, identifier in (
            ("ingressP95Ms", "maximumIngressP95Ms", "ingress.p95-ms"),
            ("batchInclusionP95Ms", "maximumBatchInclusionP95Ms", "ingress.batch-inclusion-p95-ms"),
            ("confirmedLogicalReceiptTpsAtBatch100", "minimumConfirmedLogicalReceiptTpsAtBatch100", "ingress.confirmed-logical-receipt-tps"),
            ("indexerLagBlocks", "maximumIndexerLagBlocks", "ingress.indexer-lag-blocks"),
            ("indexerRebuildSeconds", "maximumIndexerRebuildSeconds", "ingress.indexer-rebuild-seconds"),
        ):
            actual, limit = metrics.get(key), policy_value(policy, "ingress", policy_key)
            lower_bound = key == "confirmedLogicalReceiptTpsAtBatch100"
            check(identifier, actual, limit, isinstance(actual, (int, float)) and (actual >= limit if lower_bound else actual <= limit))
    if not isinstance(proof, dict) or not isinstance(proof.get("metrics"), dict):
        missing.append("proof-metrics")
    else:
        metrics = proof["metrics"]
        for key, policy_key, identifier in (
            ("proofQueueP95Ms", "maximumProofQueueP95Ms", "proof.queue-p95-ms"),
            ("onChainVerificationGas", "maximumOnChainVerificationGas", "proof.verification-gas"),
            ("proofBytes", "maximumProofBytes", "proof.bytes"),
            ("journalBytes", "maximumJournalBytes", "proof.journal-bytes"),
        ):
            actual, limit = metrics.get(key), policy_value(policy, "proof", policy_key)
            check(identifier, actual, limit, isinstance(actual, (int, float)) and actual <= limit)
        check("proof.malformed-and-binding-rejection", metrics.get("malformedAndBindingRejected"), policy_value(policy, "proof", "requireMalformedAndBindingRejection"),
              metrics.get("malformedAndBindingRejected") is policy_value(policy, "proof", "requireMalformedAndBindingRejection"))

    if result["faultCoverage"]["missing"]:
        missing.append("fault-coverage")
    if result["faultCoverage"]["failed"]:
        missing.append("failed-fault-experiment")
    if any(row.get("synthetic") is True for row in [policy]):
        missing.append("synthetic-policy")
    status = "incomplete-evidence" if missing else "threshold-breach" if any(not row["passed"] for row in checks) else "review-required"
    return {"policySha256": digest(policy_path), "status": status, "missingEvidence": sorted(set(missing)), "checks": checks}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fault-results", type=Path, required=True,
                        help="Reviewed JSON object containing an experiments array; no commands/endpoints.")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--policy", type=Path, help="Approved Phase 4 policy to evaluate; optional for schema-only reports.")
    parser.add_argument("--network-observation", type=Path)
    parser.add_argument("--miner-resources", type=Path)
    parser.add_argument("--validator-resources", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f"Refusing to overwrite {args.output}")

    faults = read_json(args.fault_results)
    experiments = faults.get("experiments")
    if faults.get("schema") != "aichain.phase4-fault-results" or not isinstance(experiments, list):
        raise SystemExit("fault results must use aichain.phase4-fault-results and contain experiments")
    kinds: set[str] = set()
    failed: list[str] = []
    for experiment in experiments:
        if not isinstance(experiment, dict) or not isinstance(experiment.get("id"), str) or not isinstance(experiment.get("kind"), str):
            raise SystemExit("each fault result needs string id and kind")
        kinds.add(experiment["kind"])
        if experiment.get("status") != "passed":
            failed.append(experiment["id"])

    result: dict[str, Any] = {
        "schema": "aichain.phase4-acceptance-report",
        "schemaVersion": "0.1.0-draft",
        "status": "review-required",
        "automatedControls": "none; this report generator does not connect to or control nodes",
        "faultResultsSha256": digest(args.fault_results),
        "faultCoverage": {"observed": sorted(kinds), "missing": sorted(REQUIRED_FAULT_KINDS - kinds), "failed": failed},
        "measurements": {},
        "limitations": [
            "Thresholds require explicit Phase 4 approval; this report does not infer production readiness.",
            "Inputs must be reviewed public-safe aggregates; do not provide keys, raw evidence, credentials or private endpoints."
        ]
    }
    if args.network_observation:
        observation = read_json(args.network_observation)
        if observation.get("schema") != "aichain.kawpow-g3-network-observation":
            raise SystemExit("unsupported network observation schema")
        result["measurements"]["network"] = {
            "sourceSha256": digest(args.network_observation),
            "startHeight": observation.get("startHeight"), "endHeight": observation.get("endHeight"),
            "blockProductionMs": observation.get("blockProductionMs"),
            "propagationObservationMs": observation.get("propagationObservationMs"),
            "canonicalHashAgreement": all(row.get("sameCanonicalHash") for row in observation.get("blocks", []) if isinstance(row, dict)),
        }
    if args.miner_resources:
        result["measurements"]["minerResources"] = resource_summary(args.miner_resources)
    if args.validator_resources:
        result["measurements"]["validatorResources"] = resource_summary(args.validator_resources)
    if args.policy:
        if faults.get("synthetic") is True:
            result["policyEvaluation"] = {"policySha256": digest(args.policy), "status": "synthetic-input", "missingEvidence": ["real-testnet-evidence"], "checks": []}
        else:
            result["policyEvaluation"] = evaluate_policy(args.policy, read_json(args.policy), result, experiments)
        result["status"] = result["policyEvaluation"]["status"]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "faultCoverage": result["faultCoverage"],
                      "measurementGroups": sorted(result["measurements"])}, indent=2))


if __name__ == "__main__":
    main()
