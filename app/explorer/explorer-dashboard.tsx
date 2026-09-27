"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { readBatchManifestFile, verifyReceiptAgainstAnchor } from "../../lib/receipt-manifest.js";

type Anchor = {
  batchId: string;
  batchRoot: string;
  publisher: string;
  leafCount: number;
  schemaVersion: string;
  transactionHash: string;
  blockNumber: number;
};
type RecentData = { network: string; chainId: number; latestBlock: number; fromBlock: number; scannedBlocks: number; anchors: Anchor[] };
type Verification = {
  verified: boolean;
  status: string;
  message?: string;
  confirmations?: number;
  blockNumber?: number;
  blockHash?: string;
  transactionHash?: string;
  transactionFrom?: string;
  publisher?: string;
  batchId?: string;
  batchRoot?: string;
  leafCount?: number;
  schemaVersion?: string;
  proofScope?: string;
};

const SAMPLE_TRANSACTION = "0xb23a4e1b9c4c1eed80e3cf4d27b2c21e00f0baaf09e8d1a9447a567caf1851bd";
const BASESCAN = "https://sepolia.basescan.org/tx/";

function short(value?: string, start = 10, end = 8) {
  if (!value) return "—";
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function number(value?: number) {
  return typeof value === "number" ? new Intl.NumberFormat("en").format(value) : "—";
}

export function ExplorerDashboard() {
  const [recent, setRecent] = useState<RecentData | null>(null);
  const [recentError, setRecentError] = useState("");
  const [loading, setLoading] = useState(true);
  const [transactionHash, setTransactionHash] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [membership, setMembership] = useState<{ verified: boolean; receiptId: string; proof: string[]; leafIndex?: number; message: string } | null>(null);
  const [membershipError, setMembershipError] = useState("");
  const [checkingMembership, setCheckingMembership] = useState(false);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    setRecentError("");
    try {
      const response = await fetch("/api/explorer", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not read Base Sepolia activity.");
      setRecent(body as RecentData);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (error) {
      setRecentError(error instanceof Error ? error.message : "Could not read Base Sepolia activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRecent(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRecent]);

  const verify = async (hash: string) => {
    setVerifying(true);
    setVerification(null);
    setVerifyError("");
    try {
      const response = await fetch(`/api/explorer?tx=${encodeURIComponent(hash.trim())}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not verify this transaction.");
      setVerification(body as Verification);
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "Could not verify this transaction.");
    } finally {
      setVerifying(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (transactionHash.trim()) void verify(transactionHash.trim());
  };

  const checkMembership = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMembership(null);
    setMembershipError("");
    setCheckingMembership(true);
    try {
      if (!verification?.verified) throw new Error("Verify a successful, canonical anchor transaction first.");
      const manifest = await readBatchManifestFile(manifestFile);
      setMembership(verifyReceiptAgainstAnchor(manifest, receiptId.trim(), verification));
    } catch (error) {
      setMembershipError(error instanceof Error ? error.message : "Could not verify receipt membership.");
    } finally {
      setCheckingMembership(false);
    }
  };

  return <div className="explorer-shell">
    <section className="explorer-intro">
      <div><p className="eyebrow">Read-only network view · Base Sepolia</p><h2>Check the public anchor.</h2><p>Inspect batch records published to the test network. Search a transaction to confirm the anchor event and canonical block directly against Base Sepolia.</p></div>
      <div className={`explorer-network ${recent ? "is-connected" : recentError ? "is-offline" : "is-loading"}`} aria-live="polite">
        <span className="explorer-status-dot" aria-hidden="true" />
        <div><strong>{recent ? "Base Sepolia connected" : recentError ? "RPC unavailable" : "Connecting to Base Sepolia"}</strong><small>{recent ? `Chain ID ${recent.chainId} · refreshed ${updatedAt}` : recentError || "Reading the latest block…"}</small></div>
      </div>
    </section>

    <section className="explorer-overview" aria-label="Network overview">
      <article><span>Network</span><strong>Base Sepolia</strong><small>Public testnet · read-only</small></article>
      <article><span>Chain ID</span><strong>{recent ? number(recent.chainId) : "—"}</strong><small>Expected 84532</small></article>
      <article><span>Latest block</span><strong>{recent ? number(recent.latestBlock) : "—"}</strong><small>{recent ? `Scanning ${number(recent.scannedBlocks)} recent blocks` : "Waiting for RPC"}</small></article>
      <article><span>Anchors found</span><strong>{recent ? number(recent.anchors.length) : "—"}</strong><small>In the current scan window</small></article>
    </section>

    <section className="explorer-verify" aria-labelledby="verify-title">
      <div className="explorer-section-heading"><div><p className="eyebrow">Transaction verification</p><h2 id="verify-title">Did this transaction anchor a batch?</h2><p>Paste a transaction hash. We check its receipt, the Base Sepolia chain, the anchor contract event and the event’s canonical block.</p></div><button type="button" className="explorer-refresh" onClick={() => { setTransactionHash(SAMPLE_TRANSACTION); void verify(SAMPLE_TRANSACTION); }} disabled={verifying}>Verify sample transaction <span aria-hidden="true">↗</span></button></div>
      <form className="explorer-search" onSubmit={submit}>
        <label className="sr-only" htmlFor="anchor-tx-hash">Base Sepolia transaction hash</label>
        <input id="anchor-tx-hash" inputMode="text" autoComplete="off" spellCheck={false} placeholder="0x… transaction hash" value={transactionHash} onChange={(event) => setTransactionHash(event.target.value)} aria-describedby="tx-hash-help" />
        <button type="submit" disabled={verifying || !transactionHash.trim()}>{verifying ? "Checking…" : "Verify transaction"}</button>
        <small id="tx-hash-help">Read-only check. This page never asks for a wallet or private key.</small>
      </form>

      {verifyError && <p className="explorer-error" role="alert">{verifyError}</p>}
      {verification && <div className={`verification-result ${verification.verified ? "is-valid" : "is-invalid"}`} aria-live="polite">
        <div className="verification-result-heading"><span aria-hidden="true">{verification.verified ? "✓" : "!"}</span><div><strong>{verification.verified ? "Canonical batch anchor found" : verification.status === "not-found" ? "Transaction not found" : "Anchor not verified"}</strong><p>{verification.message ?? `Successful Base Sepolia inclusion · ${number(verification.confirmations)} confirmation${verification.confirmations === 1 ? "" : "s"}`}</p></div>{verification.transactionHash && <a href={`${BASESCAN}${verification.transactionHash}`} target="_blank" rel="noreferrer">Open in BaseScan ↗</a>}</div>
        {verification.verified && <><dl className="verification-fields"><div><dt>Batch root</dt><dd><code>{verification.batchRoot}</code></dd></div><div><dt>Batch ID</dt><dd><code>{short(verification.batchId, 16, 12)}</code></dd></div><div><dt>Publisher</dt><dd><code>{short(verification.publisher)}</code></dd></div><div><dt>Receipt count</dt><dd>{number(verification.leafCount)}</dd></div><div><dt>Anchor schema</dt><dd>{verification.schemaVersion}</dd></div><div><dt>Block</dt><dd>{number(verification.blockNumber)}</dd></div><div><dt>Block hash</dt><dd><code>{short(verification.blockHash, 16, 12)}</code></dd></div></dl><p className="proof-scope">{verification.proofScope}</p></>}
      </div>}
    </section>

    <section className="explorer-membership" aria-labelledby="membership-title">
      <div className="explorer-section-heading"><div><p className="eyebrow">Local proof check · no upload</p><h2 id="membership-title">Does a receipt belong to this batch?</h2><p>Choose the batch manifest and enter one receipt ID. Your browser recomputes the Merkle root, matches every public batch field, and checks the receipt’s inclusion proof against the verified anchor.</p></div></div>
      <form className="membership-form" onSubmit={checkMembership}>
        <label className="manifest-drop"><span>Batch manifest JSON</span><input type="file" accept="application/json,.json" onChange={(event) => { setManifestFile(event.target.files?.[0] ?? null); setMembership(null); setMembershipError(""); }} /><small>{manifestFile ? `${manifestFile.name} · ${(manifestFile.size / 1024).toFixed(1)} KB · read locally` : "File stays in this tab and is never sent to the API."}</small></label>
        <label className="receipt-id-field"><span>Receipt ID (bytes32)</span><input value={receiptId} onChange={(event) => { setReceiptId(event.target.value); setMembership(null); }} placeholder="0x… receipt ID" autoComplete="off" spellCheck={false} /></label>
        <button type="submit" disabled={checkingMembership || !manifestFile || !receiptId.trim() || !verification?.verified}>{checkingMembership ? "Checking locally…" : "Verify receipt membership"}</button>
      </form>
      {!verification?.verified && <p className="membership-hint">First verify the anchor transaction above. Receipt membership is meaningful only when bound to a confirmed on-chain batch root.</p>}
      {membershipError && <p className="explorer-error" role="alert">{membershipError}</p>}
      {membership && <div className={`membership-result ${membership.verified ? "is-valid" : "is-invalid"}`} aria-live="polite"><strong>{membership.verified ? "Receipt is included in the anchored batch" : "Receipt is not in this batch"}</strong><p>{membership.message}</p>{membership.verified && <><dl><div><dt>Receipt ID</dt><dd><code>{membership.receiptId}</code></dd></div><div><dt>Position</dt><dd>{number(membership.leafIndex)} of {number(verification?.leafCount)}</dd></div><div><dt>Proof depth</dt><dd>{membership.proof.length} sibling hashes</dd></div></dl><details><summary>Show Merkle proof</summary><pre>{JSON.stringify({ receiptId: membership.receiptId, leafIndex: membership.leafIndex, siblings: membership.proof, batchRoot: verification?.batchRoot, transactionHash: verification?.transactionHash }, null, 2)}</pre></details></>}</div>}
      <p className="membership-limit">This proves the supplied receipt ID is a leaf in the manifest committed by this anchor. It does not disclose or validate the receipt contents, prove the source data is truthful, or establish that a model outcome was safe.</p>
    </section>

    <section className="explorer-recent" aria-labelledby="recent-title">
      <div className="explorer-section-heading"><div><p className="eyebrow">On-chain activity</p><h2 id="recent-title">Recent batch anchors</h2><p>V2 anchor events emitted by the deployed Orvessian test contract.</p></div><button type="button" className="explorer-refresh" onClick={() => void loadRecent()} disabled={loading}>{loading ? "Refreshing…" : "Refresh activity ↻"}</button></div>
      {recentError && <p className="explorer-error" role="alert">{recentError}</p>}
      {loading && !recent && <div className="explorer-empty" role="status">Reading recent Base Sepolia anchor events…</div>}
      {!loading && !recentError && recent?.anchors.length === 0 && <div className="explorer-empty"><strong>No anchor events in the latest {number(recent.scannedBlocks)} blocks.</strong><span>The public RPC limits event scans to this recent window. Use transaction-hash verification for older anchors.</span></div>}
      {recent && recent.anchors.length > 0 && <div className="explorer-table-wrap"><table className="explorer-table"><thead><tr><th>Transaction</th><th>Block</th><th>Batch root</th><th>Receipts</th><th>Publisher</th></tr></thead><tbody>{recent.anchors.map((anchor) => <tr key={`${anchor.transactionHash}-${anchor.logIndex}`}><td><button type="button" className="hash-button" onClick={() => { setTransactionHash(anchor.transactionHash); void verify(anchor.transactionHash); }}>{short(anchor.transactionHash, 12, 8)}</button></td><td>{number(anchor.blockNumber)}</td><td><code>{short(anchor.batchRoot, 12, 8)}</code></td><td>{number(anchor.leafCount)}</td><td><code>{short(anchor.publisher)}</code></td></tr>)}</tbody></table></div>}
      {recent && <p className="explorer-footnote">The activity list scans blocks {number(recent.fromBlock)}–{number(recent.latestBlock)}. {updatedAt ? `Last updated ${updatedAt}.` : ""} Open an anchor’s transaction to verify it independently.</p>}
    </section>

    <section className="explorer-boundary" aria-label="Verification scope">
      <div><span>WHAT THIS PAGE CHECKS</span><p>A successful Base Sepolia transaction, its canonical block, the publisher-scoped batch event, and locally recomputed receipt membership against the anchored root when you provide a manifest.</p></div>
      <div><span>WHAT THIS PAGE DOES NOT CLAIM</span><p>Membership proves inclusion of an identifier only. It does not validate the receipt contents, prove the source data is truthful, or prove an AI outcome was correct or safe.</p></div>
    </section>
    <p className="explorer-disclaimer">Testnet data only. The anchor stores a commitment and batch metadata, not source prompts, model inputs, outputs or other private evidence. A later authenticated workspace will join private receipts and membership proofs to these public anchors.</p>
  </div>;
}
