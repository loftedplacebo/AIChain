# Base Sepolia ReceiptBatchAnchor deployment — 2026-09-20

## Scope

This is the first public test deployment of the publisher-scoped `ReceiptBatchAnchor` contract. It is a Base Sepolia integration environment only: it does not issue a token, process production receipt data, or represent a mainnet launch.

| Item | Value |
| --- | --- |
| Network | Base Sepolia, chain ID `84532` |
| Contract | `ReceiptBatchAnchor` |
| Contract address | [`0x5781540E4682A9D35011C94A25F615e438E8E7aF`](https://sepolia.basescan.org/address/0x5781540E4682A9D35011C94A25F615e438E8E7aF) |
| Deployment transaction | [`0x15f60cf6440038de5ebfdeb7becf9fdeb4b4a21b00825ce47ed8af22ae476e06`](https://sepolia.basescan.org/tx/0x15f60cf6440038de5ebfdeb7becf9fdeb4b4a21b00825ce47ed8af22ae476e06) |
| Deployer | `0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3` (Fluxora) |
| Compiler | Solidity `0.8.24`, optimiser enabled with 200 runs, EVM `paris` |
| Transaction value | `0` Base Sepolia ETH |
| Receipt status | `1` (success) |

## Independent verification

The read-only verifier retrieved the Base Sepolia receipt and runtime code after mining. It confirmed:

- the transaction is contract creation (`to: null`);
- Fluxora submitted it;
- the receipt contract address matches the address above;
- deployed runtime bytecode is 2,270 bytes; and
- its Keccak-256 fingerprint is `0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f`, exactly matching the locally reviewed artifact.

Run the same check again at any time:

```powershell
npm run base:verify-deployment -- 0x15f60cf6440038de5ebfdeb7becf9fdeb4b4a21b00825ce47ed8af22ae476e06
```

## Next integration gate

Complete. A one-leaf synthetic batch was anchored on 2026-09-21 and retrieved through the V2-aware SDK indexer before any non-synthetic evidence is permitted through the Base path.

| Item | Value |
| --- | --- |
| Synthetic-anchor transaction | [`0xb23a4e1b9c4c1eed80e3cf4d27b2c21e00f0baaf09e8d1a9447a567caf1851bd`](https://sepolia.basescan.org/tx/0xb23a4e1b9c4c1eed80e3cf4d27b2c21e00f0baaf09e8d1a9447a567caf1851bd) |
| Block | `47122328` |
| Event | `ReceiptBatchAnchoredV2` |
| Synthetic receipt ID / root | `0x4632a8cc570c62434d6f79f2acb55aac85a96b66aeb32dab98d646044e3b9a07` |
| Batch ID | `0xf8939ad88e24523da2f3d0177f9711adb7b8f6c8e49fad48f525167913e9f674` |
| Publisher | Fluxora: `0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3` |
| Leaf count / schema | `1` / `0.4.0-alpha` |

MetaMask submitted this through a wallet wrapper, so the outer transaction destination was not the anchor address. The canonical receipt still contains the expected event from the anchor contract, with the expected Fluxora publisher, root, batch ID, count and schema. Receipt-log validation, rather than an assumption that the outer transaction destination equals the anchor, is therefore the correct compatibility behaviour for smart-wallet users.

The verifier command `npm run base:verify-synthetic-anchor -- <transaction-hash>` performs the independent receipt-event check, then indexes the event and resolves the synthetic receipt to its Merkle inclusion record. The Base public RPC prunes block zero, so the indexer now treats an unavailable genesis block as optional binding metadata while retaining chain ID, contract set and start block binding.
