const fs = require('node:fs');
const path = require('node:path');

const tenantRef = 'org-demo';
const projectRef = 'claims-governance-demo';
const profile = 'urn:aichain:profile:enterprise-agent';
const start = Date.parse('2026-09-01T09:00:00.000Z');
const events = [];
let sequence = 0;
function stamp(offsetSeconds) { return new Date(start + offsetSeconds * 1000).toISOString(); }
function common(eventId, eventType, offset, extra = {}) {
  return {
    schema: 'aichain.governance-event', schemaVersion: '0.1.0-draft', profile,
    tenantRef, projectRef, environment: 'demo', eventId, streamRef: 'demo-ingest-stream',
    occurredAt: stamp(offset), receivedAt: stamp(offset + 1), eventType,
    sequence: String(++sequence),
    source: { kind: 'customer-gateway', integrationVersion: 'demo-sdk-0.1.0', keyRef: 'demo-gateway-key' },
    ...extra
  };
}
for (let index = 0; index < 30; index += 1) {
  const caseRef = `case-${String(index + 1).padStart(3, '0')}`;
  const truth = index % 3 === 0 ? 'review' : 'approve';
  for (const model of [
    { deploymentRef: 'claims-model-v1', configVersion: 'config-17', wrong: index % 10 < 3 },
    { deploymentRef: 'claims-model-v2', configVersion: 'config-21', wrong: index % 10 < 1 }
  ]) {
    const runRef = `run-${model.deploymentRef}-${caseRef}`;
    const eventId = `run-event-${model.deploymentRef}-${caseRef}`;
    const predictedLabel = model.wrong ? (truth === 'review' ? 'approve' : 'review') : truth;
    const offset = index * 120 + (model.deploymentRef.endsWith('v2') ? 30 : 0);
    const modelDetails = { providerRef: 'provider-demo', modelRef: 'claims-assistant', deploymentRef: model.deploymentRef, configVersion: model.configVersion };
    events.push(common(eventId, 'ai.run.completed', offset, {
      runRef, caseRef, agentRef: 'claims-agent-3', model: modelDetails,
      activity: { taskClass: 'equipment-claim-routing', inputClass: 'claim-summary', outputClass: 'routing-recommendation', retrievalCount: 3, toolCalls: [{ toolRef: 'invoice-checker', version: '4.2.1', resultCode: 'consistent', allowed: true }], latencyMs: model.deploymentRef.endsWith('v2') ? 1420 : 1680, tokenBand: '1k-2k' },
      result: { predictedLabel, status: 'completed' }
    }));
    events.push(common(`policy-${model.deploymentRef}-${caseRef}`, 'ai.policy.evaluated', offset + 2, {
      runRef, caseRef, model: modelDetails,
      policy: { policyRef: 'claims-routing', version: 'policy-8', decision: 'allow', ruleRefs: ['required-checks-present'] }
    }));
    events.push(common(`label-${model.deploymentRef}-${caseRef}`, 'ai.outcome.adjudicated', offset + 86400, {
      caseRef, source: { kind: 'human-reviewer', integrationVersion: 'review-rubric-3', keyRef: 'adjudicator-key' },
      outcome: { forEventId: eventId, label: truth, labelSource: 'human-adjudication', evaluatorRef: 'review-team', rubricVersion: 'rubric-3', adjudicatedAt: stamp(offset + 86400) }
    }));
  }
}
const approved = `0x${'a'.repeat(64)}`;
const observed = `0x${'b'.repeat(64)}`;
events.push(common('config-observed-mismatch-001', 'ai.runtime.config-observed', 8000, {
  agentRef: 'claims-agent-3', source: { kind: 'independent-monitor', integrationVersion: 'runtime-monitor-1.2.0', keyRef: 'monitor-key-3' },
  model: { providerRef: 'provider-demo', modelRef: 'claims-assistant', deploymentRef: 'claims-model-v2', configVersion: 'config-21', approvedConfigDigest: approved, observedConfigDigest: observed, observationSource: 'sidecar-runtime-measurement' }
}));
events.push(common('alert-config-mismatch-001', 'ai.monitor.alerted', 8001, {
  agentRef: 'claims-agent-3', source: { kind: 'independent-monitor', integrationVersion: 'runtime-monitor-1.2.0', keyRef: 'monitor-key-3' },
  monitor: { monitorRef: 'runtime-config-monitor', signalCode: 'approved-config-mismatch', severity: 'high', expectedDigest: approved, observedDigest: observed, disposition: 'investigating' }
}));

events.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
events.forEach((event, index) => { event.sequence = String(index + 1); });

const output = {
  dataset: 'aichain.governance-demo', schemaVersion: '0.1.0-draft', synthetic: true,
  description: 'Fabricated paired comparison: two model deployments evaluated against the same 30 claim cases, with separate human-adjudicated outcomes and one independent configuration-mismatch alert. Contains no source conversation or customer evidence.',
  expectedSummary: { cases: 30, runsPerDeployment: 30, deploymentV1Correct: 21, deploymentV1Accuracy: 0.7, deploymentV2Correct: 27, deploymentV2Accuracy: 0.9, configurationMismatchAlerts: 1 },
  events
};
const outputPath = path.join(__dirname, '..', 'fixtures', 'governance', 'paired-model-comparison-v0.1.0-draft.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${outputPath}\n`);
