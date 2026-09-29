// Deterministic planning arithmetic, not a chain benchmark or security simulation.
// Run from any directory: node development/tools/model-settlement-options.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const secondsPerDay = 86400;
const maxBatch = 1000;
const maxWaitSeconds = 10;
const prices = [0.001, 0.01, 0.1]; // Hypothetical USD per complete anchor transaction.
// Fluid approximation: a timer starts with the first event of each nonempty batch.
// Do not apply this across independent tenants/queues without modelling each queue.
function scenario(label, eventsPerDay, independentQueues = 1) {
  const ratePerQueue = eventsPerDay / secondsPerDay / independentQueues;
  const meanBatch = Math.min(maxBatch, 1 + ratePerQueue * maxWaitSeconds);
  const anchorsPerDay = eventsPerDay / meanBatch;
  return {
    label, eventsPerDay, independentQueues, eventTPS: eventsPerDay / secondsPerDay,
    approximateEventsPerBatch: meanBatch,
    approximateAnchorsPerDay: anchorsPerDay,
    approximateAnchorTPS: anchorsPerDay / secondsPerDay,
    fullBatchOnlyAnchorsPerDay: eventsPerDay / maxBatch,
    fullBatchFirstEventWaitSeconds: (maxBatch - 1) / ratePerQueue,
    approximateMonthlyAnchorCostUSD: Object.fromEntries(prices.map(p => [p, anchorsPerDay * 30 * p])),
    rawEvidenceGBPerDayAt2KB: eventsPerDay * 2000 / 1e9,
  };
}
const scenarios = [
  scenario('50,000 events/week; shared queue', 50000 / 7),
  scenario('1 million/day; shared queue', 1e6),
  scenario('10 million/day; shared queue', 1e7),
  scenario('100 million/day; shared queue', 1e8),
  scenario('1 million/day; 1,000 separate tenant queues', 1e6, 1000),
];
const weights = { securityFit: 25, delivery: 25, operations: 20, reuse: 15, capacity: 10, sovereignty: 5 };
const ratings = {
  ownPoW: [2, 2, 1, 5, 3, 5],
  ownPermissionlessPoS: [2, 1, 2, 4, 4, 5],
  ownPermissionedBFT: [2, 3, 3, 4, 5, 4],
  existingEVMPublicNetwork: [4, 5, 4, 4, 4, 2],
};
const scores = Object.fromEntries(Object.entries(ratings).map(([name, values]) => [name,
  Object.values(weights).reduce((total, weight, i) => total + weight * values[i], 0) / 100,
]));
assert.equal(Object.values(weights).reduce((a, b) => a + b), 100);
for (const s of scenarios) {
  assert(s.approximateEventsPerBatch >= 1 && s.approximateEventsPerBatch <= maxBatch);
  assert(s.approximateAnchorsPerDay <= s.eventsPerDay);
  assert(s.approximateAnchorsPerDay >= s.fullBatchOnlyAnchorsPerDay);
}
assert(scenarios[4].approximateAnchorsPerDay > scenarios[1].approximateAnchorsPerDay);
assert.equal(scenarios[3].approximateEventsPerBatch, 1000);
const result = {
  asOf: '2026-09-20',
  warning: 'Illustrative fluid arrivals, not measured throughput, fee quotes, PoW attack costs, or a production SLA. Bursts and finite-window rounding are excluded.',
  assumptions: { maxBatch, maxWaitSeconds, monthDays: 30, hypotheticalUSDPerAnchor: prices, evidenceBytesPerEvent: 2000 },
  scenarios, judgmentWeightsPercent: weights, subjectiveRatings: ratings, subjectiveScoresOutOf5: scores,
};
const output = path.resolve(import.meta.dirname, '../review/settlement-options-model.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
