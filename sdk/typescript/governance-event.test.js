const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateGovernanceEvent, adjudicatedAccuracy } = require('./governance-event');

const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'governance', 'paired-model-comparison-v0.1.0-draft.json'), 'utf8'));

test('synthetic paired dataset contains no full source content and every event validates', () => {
  assert.equal(dataset.synthetic, true);
  assert.equal(dataset.events.length, 182);
  for (const event of dataset.events) assert.equal(validateGovernanceEvent(event).valid, true);
});

test('rejects transcript-like source content fields', () => {
  const run = structuredClone(dataset.events.find((event) => event.eventType === 'ai.run.completed'));
  run.transcript = 'private conversation';
  assert.throws(() => validateGovernanceEvent(run), /source content field|unsupported/);
  const other = structuredClone(dataset.events.find((event) => event.eventType === 'ai.run.completed'));
  other.activity.promptText = 'private prompt';
  assert.throws(() => validateGovernanceEvent(other), /source content field|unsupported/);
});

test('rejects events larger than the serialized 64 KiB limit', () => {
  const event = structuredClone(dataset.events.find((item) => item.eventType === 'ai.run.completed'));
  event.result.debug = 'x'.repeat(70_000);
  assert.throws(() => validateGovernanceEvent(event), /exceeds 65536 bytes/);
});

test('requires typed sequence and real canonical UTC date/time',()=>{
  const run=structuredClone(dataset.events.find(e=>e.eventType==='ai.run.completed'));
  assert.throws(()=>validateGovernanceEvent({...run,sequence:1}),/decimal string/);
  assert.throws(()=>validateGovernanceEvent({...run,occurredAt:'2026-02-30T00:00:00.000Z'}),/invalid calendar/);
  assert.throws(()=>validateGovernanceEvent({...run,occurredAt:'2026-09-01T24:00:00.000Z'}),/invalid calendar/);
});

test('unknown fields, malformed digests and incorrect event requirements fail closed', () => {
  const event = structuredClone(dataset.events.find((item) => item.eventType === 'ai.run.completed'));
  event.unregisteredField = 'not accepted';
  assert.throws(() => validateGovernanceEvent(event), /unsupported/);
  const config = structuredClone(dataset.events.find((item) => item.eventType === 'ai.runtime.config-observed'));
  config.model.observedConfigDigest = 'abc';
  assert.throws(() => validateGovernanceEvent(config), /digest/);
  const policy = structuredClone(dataset.events.find((item) => item.eventType === 'ai.policy.evaluated'));
  delete policy.policy;
  assert.throws(() => validateGovernanceEvent(policy), /requires policy/);
});

test('accuracy uses linked adjudicated labels and suppresses rates below minimum sample', () => {
  const report = adjudicatedAccuracy(dataset.events);
  assert.deepEqual(report.map(({ deploymentRef, correct, total, rate, status }) => ({ deploymentRef, correct, total, rate, status })), [
    { deploymentRef: 'claims-model-v1', correct: 21, total: 30, rate: 0.7, status: 'reportable' },
    { deploymentRef: 'claims-model-v2', correct: 27, total: 30, rate: 0.9, status: 'reportable' }
  ]);
  const small = adjudicatedAccuracy(dataset.events, { minimumSampleSize: 31 });
  assert.ok(small.every((item) => item.rate === null && item.status === 'insufficient-sample'));
});

test('conflicting labels suppress the accuracy rate instead of selecting one arbitrarily', () => {
  const events = structuredClone(dataset.events);
  const outcome = events.find((event) => event.eventType === 'ai.outcome.adjudicated');
  const duplicate = structuredClone(outcome);
  duplicate.eventId = 'conflicting-label-for-same-run';
  duplicate.outcome.label = duplicate.outcome.label === 'approve' ? 'review' : 'approve';
  events.push(duplicate);
  const report = adjudicatedAccuracy(events);
  assert.ok(report.some((item) => item.status === 'conflicting-labels' && item.rate === null && item.ambiguousLabels === 1));
});
