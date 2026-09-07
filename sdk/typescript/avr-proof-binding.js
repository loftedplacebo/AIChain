// Verify a RISC Zero export against locally reconstructed AVR public values.
const { sha256, getBytes } = require('ethers');
const { canonicalize } = require('./receipt');
const { derivePublic, derivePolicyReceipt } = require('./zk-policy-statement');
const { deriveAuthorisedReceipt } = require('./authorised-receipt');

async function verifyPolicyProof(document, exported, expectedImageId, verifier) {
  if (exported.format !== 'aichain.risc0-evm-proof-export' || exported.stack !== 'risc0') throw Error('Unsupported proof export');
  if (exported.stackVersion !== '3.0.3' || exported.statementVersion !== '0.1.0-draft') throw Error('Unsupported proof version');
  if (!/^0x[0-9a-f]{64}$/.test(expectedImageId) || exported.imageId !== expectedImageId) throw Error('Untrusted image ID');
  if (getBytes(exported.seal).length !== 260 || getBytes(exported.journal).length > 2048) throw Error('Proof resource limit');
  if (sha256(exported.journal) !== exported.journalDigest) throw Error('Journal digest mismatch');
  const publicValues = JSON.parse(Buffer.from(getBytes(exported.journal)).toString('utf8'));
  const expected = derivePublic(document.publicMetadata, document.privateWitness);
  if (canonicalize(publicValues) !== canonicalize(expected)) throw Error('Proof/AVR public binding mismatch');
  if (exported.receiptId !== publicValues.receiptId) throw Error('Export receipt binding mismatch');
  const receipt = derivePolicyReceipt(document.publicMetadata, document.privateWitness);
  if (deriveAuthorisedReceipt(receipt).receiptId !== publicValues.receiptId) throw Error('Receipt binding mismatch');
  await verifier.verify(exported.seal, expectedImageId, exported.journalDigest);
  return { verified: true, receiptId: publicValues.receiptId, imageId: expectedImageId, journalDigest: exported.journalDigest,
    statementId: publicValues.statementId, scope: 'ZK-001 deterministic policy evaluation', receipt };
}
module.exports = { verifyPolicyProof };
