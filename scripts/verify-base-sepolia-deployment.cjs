#!/usr/bin/env node
// Read-only post-deployment verification for the Base Sepolia anchor.
// Usage: node scripts/verify-base-sepolia-deployment.cjs <contract-address> [deployment-tx-hash]
//    or: node scripts/verify-base-sepolia-deployment.cjs <deployment-tx-hash>
const fs = require('node:fs');
const path = require('node:path');
const { JsonRpcProvider, getAddress, keccak256 } = require('ethers');

const [firstArgument, secondArgument] = process.argv.slice(2);
if (!firstArgument) {
  throw new Error('Usage: node scripts/verify-base-sepolia-deployment.cjs <contract-address> [deployment-tx-hash]');
}
const transactionHash = /^0x[0-9a-fA-F]{64}$/.test(firstArgument) ? firstArgument : secondArgument;
const addressInput = transactionHash === firstArgument ? undefined : firstArgument;

const root = path.resolve(__dirname, '..');
const artifact = JSON.parse(fs.readFileSync(path.join(root, 'build', 'base-sepolia', 'ReceiptBatchAnchor.json'), 'utf8'));
const signer = getAddress('0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3');
const provider = new JsonRpcProvider('https://sepolia.base.org');

(async () => {
  const network = await provider.getNetwork();
  if (network.chainId !== 84532n) throw new Error(`Expected Base Sepolia (84532), received ${network.chainId}`);

  let transaction;
  let receipt;
  if (transactionHash) {
    [transaction, receipt] = await Promise.all([
      provider.getTransaction(transactionHash),
      provider.getTransactionReceipt(transactionHash),
    ]);
    if (!transaction || !receipt) throw new Error(`Transaction ${transactionHash} was not found or has not been mined`);
  }
  const address = getAddress(addressInput || receipt.contractAddress || '');

  const code = await provider.getCode(address);
  if (code === '0x') throw new Error(`No contract code exists at ${address}`);
  const result = {
    status: 'verified-read-only',
    network: { name: 'Base Sepolia', chainId: Number(network.chainId) },
    contractAddress: address,
    deployedCodeBytes: (code.length - 2) / 2,
    deployedCodeKeccak256: keccak256(code),
    expectedCodeKeccak256: keccak256(artifact.deployedBytecode),
    deployedCodeMatchesArtifact: code.toLowerCase() === artifact.deployedBytecode.toLowerCase(),
  };

  if (transactionHash) {
    result.deploymentTransaction = {
      hash: transaction.hash,
      from: getAddress(transaction.from),
      to: transaction.to,
      value: transaction.value.toString(),
      contractAddress: receipt.contractAddress,
      status: receipt.status,
      isContractCreation: transaction.to === null,
      signerMatchesFluxora: getAddress(transaction.from) === signer,
      receiptAddressMatches: receipt.contractAddress && getAddress(receipt.contractAddress) === address,
    };
  }
  console.log(JSON.stringify(result, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
