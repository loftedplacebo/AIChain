#!/usr/bin/env python3
"""Loopback-only bridge from legacy eth_getWork miners to AIChain G2 RPC."""

from __future__ import annotations

import argparse
import ipaddress
import json
import threading
import time
import urllib.request
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

MAX_REQUEST_BYTES = 4096
MAX_TRACKED_WORK = 64
WORK_VERSION = "0.1.0-dev"


def _fixed_hex(value: Any, size: int, field: str) -> str:
    if not isinstance(value, str) or len(value) != 2 + size * 2:
        raise ValueError(f"{field} must be exactly {size} bytes")
    if not value.startswith("0x") or any(c not in "0123456789abcdef" for c in value[2:]):
        raise ValueError(f"{field} must be canonical lowercase hexadecimal")
    return value


def _loopback_host(host: str | None) -> bool:
    if host == "localhost":
        return True
    try:
        return host is not None and ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class NodeRPC:
    def __init__(self, url: str, timeout: float = 10.0):
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not _loopback_host(parsed.hostname):
            raise ValueError("node RPC URL must use HTTP(S) on a loopback host")
        self.url = url
        self.timeout = timeout
        self._request_id = 0
        self._lock = threading.Lock()

    def call(self, method: str, params: list[Any]) -> Any:
        with self._lock:
            self._request_id += 1
            request_id = self._request_id
        body = json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}).encode()
        request = urllib.request.Request(self.url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            decoded = json.load(response)
        if decoded.get("error") is not None:
            raise RuntimeError(decoded["error"].get("message", "node RPC error"))
        return decoded.get("result")


class Adapter:
    def __init__(self, node: NodeRPC, audit_log: Path | None = None):
        self.node = node
        self.audit_log = audit_log
        self._work: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._lock = threading.Lock()

    def dispatch(self, method: str, params: Any) -> Any:
        if method == "eth_getWork":
            if params not in ([], None):
                raise ValueError("eth_getWork takes no parameters")
            return self.get_work()
        if method == "eth_submitWork":
            return self.submit_work(params)
        if method == "eth_submitHashrate":
            return True
        raise LookupError("method not found")

    def get_work(self) -> list[str]:
        work = self.node.call("aichain_getKawpowWork", [])
        if not isinstance(work, dict) or work.get("version") != WORK_VERSION:
            raise ValueError("unsupported or malformed node work response")
        work_id = _fixed_hex(work.get("workId"), 32, "workId")
        header_hash = _fixed_hex(work.get("headerHash"), 32, "headerHash")
        seed_hash = _fixed_hex(work.get("seedHash"), 32, "seedHash")
        target = _fixed_hex(work.get("target"), 32, "target")
        height = work.get("height")
        if not isinstance(height, str) or not height.startswith("0x"):
            raise ValueError("height must be an Ethereum quantity")
        int(height, 16)
        with self._lock:
            self._work[header_hash] = work
            self._work.move_to_end(header_hash)
            while len(self._work) > MAX_TRACKED_WORK:
                self._work.popitem(last=False)
        return [header_hash, seed_hash, target, height]

    def submit_work(self, params: Any) -> bool:
        if not isinstance(params, list) or len(params) != 3:
            raise ValueError("eth_submitWork requires nonce, header hash and mix digest")
        nonce = _fixed_hex(params[0], 8, "nonce")
        header_hash = _fixed_hex(params[1], 32, "headerHash")
        mix_digest = _fixed_hex(params[2], 32, "mixDigest")
        with self._lock:
            work = self._work.get(header_hash)
        if work is None:
            self._audit(None, header_hash, nonce, mix_digest, {"accepted": False, "status": "unknown-adapter-work"})
            return False
        work_id = work["workId"]
        submission = {"version": WORK_VERSION, "workId": work_id, "nonce": nonce, "mixDigest": mix_digest}
        result = self.node.call("aichain_submitKawpowWork", [submission])
        if not isinstance(result, dict) or not isinstance(result.get("accepted"), bool):
            raise ValueError("malformed node submission response")
        self._audit(work, header_hash, nonce, mix_digest, result)
        return result["accepted"]

    def _audit(self, work: dict[str, Any] | None, header_hash: str, nonce: str, mix_digest: str,
               result: dict[str, Any]) -> None:
        if self.audit_log is None:
            return
        entry = {"timestamp": int(time.time()), "workId": work.get("workId") if work else None,
                 "headerHash": header_hash, "nonce": nonce,
                 "mixDigest": mix_digest, **result}
        if work:
            entry.update({key: work.get(key) for key in ("parentHash", "height", "seedHash", "target", "expiresAt")})
        with self._lock:
            self.audit_log.parent.mkdir(parents=True, exist_ok=True)
            with self.audit_log.open("a", encoding="utf-8") as output:
                output.write(json.dumps(entry, separators=(",", ":")) + "\n")


def handler_for(adapter: Adapter):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_REQUEST_BYTES:
                    raise ValueError("invalid request size")
                request = json.loads(self.rfile.read(length))
                if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
                    raise ValueError("invalid JSON-RPC request")
                request_id = request.get("id")
                result = adapter.dispatch(request.get("method"), request.get("params", []))
                response = {"jsonrpc": "2.0", "id": request_id, "result": result}
            except LookupError as error:
                response = {"jsonrpc": "2.0", "id": locals().get("request_id"),
                            "error": {"code": -32601, "message": str(error)}}
            except (ValueError, json.JSONDecodeError) as error:
                response = {"jsonrpc": "2.0", "id": locals().get("request_id"),
                            "error": {"code": -32602, "message": str(error)}}
            except Exception as error:
                response = {"jsonrpc": "2.0", "id": locals().get("request_id"),
                            "error": {"code": -32000, "message": str(error)}}
            encoded = json.dumps(response, separators=(",", ":")).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, format: str, *args: Any) -> None:
            return

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node-rpc", default="http://127.0.0.1:8545")
    parser.add_argument("--listen", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18545)
    parser.add_argument("--audit-log", type=Path)
    args = parser.parse_args()
    if not _loopback_host(args.listen):
        parser.error("--listen must be a loopback address")
    adapter = Adapter(NodeRPC(args.node_rpc), args.audit_log)
    server = ThreadingHTTPServer((args.listen, args.port), handler_for(adapter))
    print(f"AIChain KawPoW getwork adapter listening on http://{args.listen}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
