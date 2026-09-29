# Base Sepolia anchor deployment runbook

## Purpose and scope

This deploys the public `ReceiptBatchAnchor` contract to **Base Sepolia** for integration testing. It is not a mainnet launch, does not issue a token, and does not move real funds. The deployer is the Fluxora MetaMask account:

`0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3`

The contract records compact Merkle-batch commitments only. Receipt payloads, customer data, prompts, and evidence stay off-chain in the evidence store.

## Reproducible build

From the repository root, run:

```powershell
npm run base:compile-anchor
npm run base:test-anchor-artifact
npm run base:prepare-deploy
```

The generated, ignored deployment manifest is `build/base-sepolia/deployment-manifest.json`. For the current source it must show:

| Field | Expected value |
| --- | --- |
| Network | Base Sepolia, chain ID `84532` |
| Compiler | Solidity `0.8.24` |
| Optimizer | enabled, 200 runs |
| EVM | `paris` |
| Constructor | none |
| Transaction `to` | empty (contract creation) |
| Transaction `value` | `0` |
| Creation data Keccak-256 | `0xccf23437b086cba0f033a19c353ca582953b1e725e57c59798fb43531c06d1ce` |

## MetaMask deployment review

Run the local deployment page after preparing the manifest:

```powershell
npm run base:deploy-ui
```

Open `http://127.0.0.1:8765/` in the Edge profile that contains MetaMask. The page reads the local manifest, requires the Fluxora address and Base Sepolia chain ID, and passes the reviewed creation data to MetaMask. It never receives a private key or signs a transaction.

1. Select **Base Sepolia** and the Fluxora address above in MetaMask.
2. Click **Connect Fluxora MetaMask** and approve the wallet connection.
3. Click **Review and deploy to Base Sepolia**.
4. Before confirming in MetaMask, check it is a contract-creation transaction, has value `0`, and its creation-data hash matches the table above. MetaMask supplies the final testnet fee; the prior read-only estimate was about 548,995 gas and the deployer holds 0.05 Base Sepolia ETH.

Save the deployment transaction hash and resulting contract address. Do not deploy to Base mainnet during this test phase.

## Post-deployment verification

After Base Sepolia confirms the transaction, run this read-only check:

```powershell
npm run base:verify-deployment -- <deployment-transaction-hash>
```

It checks the chain, deployed runtime bytecode, contract-creation receipt, and whether Fluxora submitted the deployment. The output must show `deployedCodeMatchesArtifact: true`, `isContractCreation: true`, `signerMatchesFluxora: true`, and a successful receipt status.

Then record the contract address and transaction hash in the deployment register, verify the source on BaseScan, and execute one synthetic `anchorBatch` call before connecting the live receipt ingress path.

## First anchor test

Use a synthetic non-zero Merkle root and a test schema version such as `0.4.0-alpha`. `anchorBatch` requires:

- a non-zero `bytes32` root;
- a non-zero leaf count; and
- a non-empty schema version.

The `ReceiptBatchAnchoredV2` event carries the publisher-scoped `batchId`, root, publisher, leaf count, schema version, and timestamp. A root alone does not identify its publisher; external verification must retain the emitted `batchId` and publisher alongside the Merkle proof.
