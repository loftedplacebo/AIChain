const test = require("node:test");
const assert = require("node:assert/strict");
const { Wallet, getBytes } = require("ethers");
const fixture = require("../../fixtures/avr/agent-credential-v0.1.0-draft.json");
const { deriveAgentCredential, verifyCredentialPackage } = require("./agent-credential");

test("derives and verifies a signed agent credential package", async () => {
  const wallet = new Wallet("0x59c6995e998f97a5a0044966f094538876ed3b39e46bda87f4b3e7aee8c9e2a7");
  const credential = { ...fixture, issuer: wallet.address };
  const derived = deriveAgentCredential(credential);
  const signature = await wallet.signMessage(getBytes(derived.credentialId));
  const result = verifyCredentialPackage({ credential, proof: { scheme: "eip191-personal-sign", credentialId: derived.credentialId, signature } });
  assert.equal(result.valid, true);
});

test("rejects a credential with a swapped authority commitment", () => {
  const changed = structuredClone(fixture);
  changed.authorityCommitment = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.notEqual(deriveAgentCredential(changed).credentialId, deriveAgentCredential(fixture).credentialId);
});

