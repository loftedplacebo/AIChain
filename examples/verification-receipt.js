// Offline synthetic robotics example. Writes only to the ignored build directory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Wallet } = require('ethers');
const vr = require('../sdk/typescript/verification-receipt');
const { createPresentation } = require('../sdk/typescript/avr-presentation');
const profile = require('../spec/verification-receipt/profiles/robotics.json');

async function main() {
  const wallet = Wallet.createRandom();
  const randomId = () => `0x${crypto.randomBytes(32).toString('hex')}`;
  const openings = {};
  for (const [role, text] of Object.entries({
    'machine:configuration': 'Synthetic demo firmware/controller/calibration manifest',
    'machine:authority': 'Synthetic demo mission authority; grants no real permission',
    'machine:event': 'Synthetic demo observation window; no physical event is claimed'
  })) {
    const bytes = Buffer.from(text, 'utf8');
    openings[role] = { ...await vr.commitEvidenceStream([bytes], 'text/plain'), bytesHex: bytes.toString('hex') };
    assert(vr.verifyEvidence(openings[role].commitment, bytes, openings[role].salt));
  }
  const receipt = vr.createVerificationReceipt({
    context: { chainId: '20260822', anchorContract: `0x${'aa'.repeat(20)}` },
    issuer: wallet.address.toLowerCase(), subject: { kind: 'core:robot', id: randomId() },
    event: { id: randomId(), type: 'machine:observation-window', claimedAt: new Date().toISOString(),
      observation: { clock: 'simulation', ticksNs: '1000000000', uncertaintyNs: null },
      stream: { id: randomId(), sequence: '0', previousReceiptId: null } },
    commitments: Object.fromEntries(Object.entries(openings).map(([role, opening]) => [role, opening.commitment]))
  }, profile);
  const signature = await wallet.signMessage(vr.prepareVerificationAttestation(receipt).message);
  assert(vr.verifyVerificationAttestation(receipt, signature));
  const presentation = createPresentation(receipt, { level: 'issuer-attested', attestation: {
    scheme: 'eip191-personal-sign', signer: receipt.issuer, signature
  } });
  const out = path.join(__dirname, '../build/receipt-example');
  fs.mkdirSync(out, { recursive: true });
  for (const [name, value] of Object.entries({ receipt, presentation, 'private-openings': openings })) {
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
  }
  console.log(JSON.stringify({ receiptId: presentation.receiptId, output: out, signatureVerified: true, anchored: false }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
