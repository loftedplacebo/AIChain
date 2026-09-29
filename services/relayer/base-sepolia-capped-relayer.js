// Capped Base Sepolia batch relayer. A signer must be injected by the caller;
// this module never reads, stores, or prints private key material.
const fs = require('node:fs');
const path = require('node:path');
const { BATCH_ABI, BASE_SEPOLIA_CHAIN_ID } = require('../../sdk/typescript/base-sepolia-batch-adapter');

const DEFAULT_POLICY = Object.freeze({ maxBatchReceipts: 10_000, maxTransactionsPerHour: 30, maxDailySpendWei: '10000000000000000', maxGasPriceWei: '100000000', gasLimitMultiplierBps: 12_000, paused: true });
function atomicJson(file, value) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); const temporary = `${file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, file); }

class BaseSepoliaCappedRelayer {
  constructor({ provider, signer = null, publisher, contract, stateFile, policy = {}, clock = () => Date.now() }) {
    if (!provider || !publisher || !contract || !stateFile) throw new Error('provider, publisher, contract, and stateFile are required');
    this.provider = provider; this.signer = signer; this.publisher = publisher.toLowerCase(); this.contract = contract.toLowerCase(); this.stateFile = stateFile; this.clock = clock;
    this.policy = { ...DEFAULT_POLICY, ...policy };
    for (const field of ['maxBatchReceipts', 'maxTransactionsPerHour', 'gasLimitMultiplierBps']) if (!Number.isSafeInteger(this.policy[field]) || this.policy[field] < 1) throw new Error(`policy.${field} must be a positive safe integer`);
    for (const field of ['maxDailySpendWei', 'maxGasPriceWei']) if (!/^\d+$/.test(String(this.policy[field]))) throw new Error(`policy.${field} must be an integer wei amount`);
    this.policy.maxDailySpendWei = BigInt(this.policy.maxDailySpendWei); this.policy.maxGasPriceWei = BigInt(this.policy.maxGasPriceWei);
    this.submitTail = Promise.resolve();
    this.state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { schema: 'aichain.relayer-budget', schemaVersion: '0.1.0-alpha', reservations: [] };
    if (this.state.schema !== 'aichain.relayer-budget' || !Array.isArray(this.state.reservations)) throw new Error('Malformed relayer budget state');
  }
  currentDay() { return new Date(this.clock()).toISOString().slice(0, 10); }
  async prepare(prepared) {
    if (!prepared?.synthetic || !prepared?.anchor || prepared.anchor.chainId !== BASE_SEPOLIA_CHAIN_ID || prepared.anchor.contract?.toLowerCase() !== this.contract) throw new Error('Refused: batch must target the configured synthetic Base Sepolia contract');
    if (prepared.anchor.publisher?.toLowerCase() !== this.publisher || prepared.anchor.leafCount < 1 || prepared.anchor.leafCount > this.policy.maxBatchReceipts) throw new Error('Refused: publisher or batch size violates relayer policy');
    const decoded = BATCH_ABI.parseTransaction({ data: prepared.transaction?.data });
    if (prepared.transaction.to?.toLowerCase() !== this.contract || BigInt(prepared.transaction.value ?? '0') !== 0n || decoded?.name !== 'anchorBatch' || decoded.args[0].toLowerCase() !== prepared.anchor.batchRoot.toLowerCase() || Number(decoded.args[1]) !== prepared.anchor.leafCount || decoded.args[2] !== prepared.anchor.schemaVersion) throw new Error('Refused: transaction does not match its prepared anchor manifest');
    const network = await this.provider.getNetwork(); if (network.chainId !== BigInt(BASE_SEPOLIA_CHAIN_ID)) throw new Error('Refused: provider is not connected to Base Sepolia');
    const from = this.signer ? (await this.signer.getAddress()).toLowerCase() : this.publisher;
    if (from !== this.publisher) throw new Error('Refused: injected signer does not match configured publisher');
    const estimated = await this.provider.estimateGas({ from, to: this.contract, value: 0n, data: prepared.transaction.data });
    const feeData = await this.provider.getFeeData(); const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (maxFeePerGas === null || maxFeePerGas === undefined) throw new Error('No usable fee quote from Base Sepolia RPC');
    if (maxFeePerGas > this.policy.maxGasPriceWei) throw new Error('Refused: quoted gas price exceeds relayer cap');
    const gasLimit = estimated * BigInt(this.policy.gasLimitMultiplierBps) / 10_000n; const reservedWei = gasLimit * maxFeePerGas;
    const day = this.currentDay(); const today = this.state.reservations.filter(item => item.day === day);
    if (today.length >= this.policy.maxTransactionsPerHour * 24) throw new Error('Refused: daily transaction count ceiling reached');
    const hourAgo = this.clock() - 60 * 60 * 1000; if (today.filter(item => item.at >= hourAgo).length >= this.policy.maxTransactionsPerHour) throw new Error('Refused: hourly transaction rate ceiling reached');
    const dailyReserved = today.reduce((sum, item) => sum + BigInt(item.reservedWei), 0n); if (dailyReserved + reservedWei > this.policy.maxDailySpendWei) throw new Error('Refused: daily gas budget would be exceeded');
    return { from, to: this.contract, data: prepared.transaction.data, value: '0x0', estimatedGas: estimated.toString(), gasLimit: gasLimit.toString(), maxFeePerGas: maxFeePerGas.toString(), reservedWei: reservedWei.toString(), dailyReservedWei: dailyReserved.toString(), batchId: prepared.anchor.batchId, leafCount: prepared.anchor.leafCount, day };
  }
  submit(prepared, options = {}) {
    const run = () => this.submitUnlocked(prepared, options);
    const result = this.submitTail.then(run, run);
    this.submitTail = result.then(() => undefined, () => undefined);
    return result;
  }
  async submitUnlocked(prepared, { dryRun = true } = {}) {
    if (this.policy.paused) throw new Error('Relayer is paused by policy');
    const quote = await this.prepare(prepared);
    if (dryRun) return { status: 'dry-run', quote };
    if (!this.signer) throw new Error('Broadcast requires an explicitly injected signer');
    const reservation = { day: quote.day, at: this.clock(), reservedWei: quote.reservedWei, batchId: quote.batchId, status: 'reserved' };
    this.state.reservations.push(reservation); atomicJson(this.stateFile, this.state);
    try {
      const response = await this.signer.sendTransaction({ to: quote.to, data: quote.data, value: 0n, gasLimit: BigInt(quote.gasLimit), maxFeePerGas: BigInt(quote.maxFeePerGas) });
      reservation.status = 'submitted'; reservation.transactionHash = response.hash; atomicJson(this.stateFile, this.state);
      return { status: 'submitted', transactionHash: response.hash, quote };
    } catch (error) { reservation.status = 'broadcast-uncertain'; reservation.errorCode = error.code ?? 'unknown'; atomicJson(this.stateFile, this.state); throw error; }
  }
}

module.exports = { BaseSepoliaCappedRelayer, DEFAULT_POLICY };
