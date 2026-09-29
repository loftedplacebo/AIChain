#!/usr/bin/env python3
"""Paced synthetic-only AVR ingress load runner; it never anchors or signs."""
from __future__ import annotations

import argparse
import concurrent.futures
from concurrent.futures import FIRST_COMPLETED
import datetime as dt
import hashlib
import json
import os
import pathlib
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "fixtures/avr/receipt-v0.1.0-draft.json"
if not FIXTURE_PATH.exists():
    FIXTURE_PATH = pathlib.Path(__file__).resolve().parent / "receipt-v0.1.0-draft.json"
TEMPLATE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
RECEIPT_DOMAIN = "aichain:avr:0.1.0-draft:"
COMMITMENTS_DOMAIN = "aichain:avr:commitments:0.1.0-draft:"


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(domain: str, value: object) -> str:
    return "0x" + hashlib.sha256((domain + canonical(value)).encode()).hexdigest()


def make_presentation(run_id: str, index: int) -> dict:
    receipt = json.loads(json.dumps(TEMPLATE))
    receipt.pop("expected", None)
    receipt["commitments"]["input"] = "0x" + hashlib.sha256(f"aichain:python-load:{run_id}:{index}".encode()).hexdigest()
    return {
        "schema": "aichain.avr-presentation",
        "schemaVersion": "0.3.0-alpha",
        "receipt": receipt,
        "receiptId": digest(RECEIPT_DOMAIN, receipt),
        "commitmentsRoot": digest(COMMITMENTS_DOMAIN, receipt["commitments"]),
        "assurance": {"level": "commitment-only"},
        "anchor": None,
    }


def percentile(samples: list[float], quantile: float) -> float | None:
    if not samples:
        return None
    ordered = sorted(samples)
    return round(ordered[min(len(ordered) - 1, max(0, int((len(ordered) * quantile + 0.999999)) - 1))], 3)


def request_json(url: str, method: str = "GET", headers: dict | None = None, payload: dict | None = None, timeout: float = 10) -> tuple[int, dict, float]:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        body, status = error.read(), error.code
    elapsed = (time.perf_counter() - started) * 1000
    try:
        return status, json.loads(body or b"{}"), elapsed
    except json.JSONDecodeError:
        return status, {"error": body[:512].decode(errors="replace")}, elapsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("AICHAIN_SYNTHETIC_INGRESS_URL", "http://127.0.0.1:8787"))
    parser.add_argument("--api-key", default=os.environ.get("AICHAIN_SYNTHETIC_API_KEY"))
    parser.add_argument("--api-key-stdin", action="store_true", help="Read the API key from stdin so it does not appear in process arguments")
    parser.add_argument("--rates", default="1,10,25", help="Comma-separated receipt rates per second; fractional rates are supported for soak tests")
    parser.add_argument("--seconds", type=int, default=60, help="Duration at each rate")
    parser.add_argument("--max-receipts", type=int, default=10000)
    parser.add_argument("--max-queue", type=int, default=8000, help="Stop at this observed queued count")
    parser.add_argument("--workers", type=int, default=32)
    parser.add_argument("--run-id", default=f"vps-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}")
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()
    if args.api_key_stdin:
        args.api_key = sys.stdin.readline().strip()
    if not args.api_key or len(args.api_key) < 16:
        parser.error("provide AICHAIN_SYNTHETIC_API_KEY through the process environment")
    if not args.url.startswith(("http://127.0.0.1", "http://localhost", "https://")):
        parser.error("use loopback HTTP or HTTPS; plaintext remote ingress is refused")
    if args.seconds < 1 or args.max_receipts < 1 or args.workers < 1 or args.max_queue < 1:
        parser.error("seconds, max-receipts, workers, and max-queue must be positive")
    rates = [float(part) for part in args.rates.split(",")]
    if not rates or any(rate <= 0 for rate in rates):
        parser.error("rates must be positive numbers")
    base = args.url.rstrip("/")
    headers = {"content-type": "application/json", "x-aichain-api-key": args.api_key}
    status, before, _ = request_json(base + "/health", headers=headers)
    if status != 200 or before.get("status") != "ok":
        raise SystemExit(f"ingress health check failed: HTTP {status} {before}")

    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    stop = threading.Event()
    results: list[dict] = []
    failures: list[dict] = []
    lock = threading.Lock()
    submitted = 0
    scheduled = 0
    hard_stop_reason = None

    def submit_one(index: int) -> None:
        nonlocal submitted, hard_stop_reason
        if stop.is_set():
            return
        try:
            presentation = make_presentation(args.run_id, index)
            code, response, latency = request_json(base + "/v1/synthetic/receipts", "POST", headers, {"synthetic": True, "presentation": presentation})
        except Exception as error:
            code, response, latency = 0, {"status": "transport-error", "reason": str(error)}, 0
        with lock:
            if code == 202 and response.get("accepted") is True:
                results.append({"index": index, "latencyMs": latency})
                submitted += 1
            else:
                failures.append({"index": index, "httpStatus": code, "status": response.get("status"), "reason": response.get("reason")})
                hard_stop_reason = f"submission failed at index {index}: {response.get('status', code)}"
                stop.set()

    service_started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for rate in rates:
            if stop.is_set() or scheduled >= args.max_receipts:
                break
            phase_start = time.monotonic()
            phase_end = phase_start + args.seconds
            next_submit = phase_start
            pending: set[concurrent.futures.Future] = set()
            while time.monotonic() < phase_end and scheduled < args.max_receipts and not stop.is_set():
                now = time.monotonic()
                if now < next_submit:
                    done, pending = concurrent.futures.wait(pending, timeout=min(next_submit - now, 0.1), return_when=FIRST_COMPLETED) if pending else (set(), pending)
                    if done and submitted and submitted % 100 == 0:
                        code, health, _ = request_json(base + "/health", headers=headers)
                        if code != 200 or health.get("queued", 0) >= args.max_queue:
                            hard_stop_reason = f"queue stop threshold reached ({health.get('queued')})"
                            stop.set()
                    continue
                pending = {future for future in pending if not future.done()}
                pending.add(pool.submit(submit_one, scheduled))
                scheduled += 1
                next_submit += 1 / rate
                if time.monotonic() > next_submit + 1:
                    next_submit = time.monotonic()
            concurrent.futures.wait(pending)

    code, after, _ = request_json(base + "/health", headers=headers)
    elapsed = time.monotonic() - service_started
    report = {
        "schema": "aichain.synthetic-ingress-load-report", "schemaVersion": "0.1.0-alpha",
        "runId": args.run_id, "startedAt": started_at, "completedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "requestedRatesPerSecond": rates, "secondsPerRate": args.seconds, "maxReceipts": args.max_receipts,
        "accepted": len(results), "failed": len(failures), "serviceElapsedSeconds": round(elapsed, 3),
        "acceptedReceiptsPerServiceSecond": round(len(results) / elapsed, 3) if elapsed else 0,
        "latencyMs": {"p50": percentile([item["latencyMs"] for item in results], .50), "p95": percentile([item["latencyMs"] for item in results], .95), "max": round(max((item["latencyMs"] for item in results), default=0), 3)},
        "stopReason": hard_stop_reason, "healthBefore": before, "healthAfter": after, "healthHttpStatus": code,
        "failuresSample": failures[:20], "scope": "synthetic-only ingress; no batch preparation, signing, or chain submission",
    }
    output = args.output or ROOT / "build" / "base-sepolia" / "vps-load-runs" / f"{args.run_id}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(output), **report}, indent=2))
    return 1 if failures or hard_stop_reason else 0


if __name__ == "__main__":
    raise SystemExit(main())
