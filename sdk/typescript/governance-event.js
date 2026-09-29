const MAX_EVENT_BYTES = 64 * 1024;
const EVENT_TYPES = new Set([
  'ai.run.completed', 'ai.policy.evaluated', 'ai.human.reviewed',
  'ai.outcome.adjudicated', 'ai.runtime.config-observed', 'ai.monitor.alerted'
]);
const FORBIDDEN_CONTENT_KEYS = new Set([
  'prompt', 'prompttext', 'conversation', 'transcript', 'messages', 'document',
  'rawdata', 'sensordata', 'inputtext', 'outputtext', 'sourcecontent'
]);
const REF = /^[A-Za-z0-9._:-]{1,128}$/;
const DIGEST = /^0x[0-9a-f]{64}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function fail(message) { throw new TypeError(`Invalid governance event: ${message}`); }
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
}
function onlyKeys(value, keys, name) {
  object(value, name);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${name}.${key} is unsupported`);
}
function ref(value, name) { if (typeof value !== 'string' || !REF.test(value)) fail(`${name} must be a bounded reference`); }
function time(value, name) {
  if (typeof value !== 'string' || !ISO_TIME.test(value) || Number.isNaN(Date.parse(value))) fail(`${name} must be a UTC timestamp`);
  if (Number(value.slice(0,4))<1 || new Date(value).toISOString()!==value) fail(`${name} contains an invalid calendar date or time`);
}
function digest(value, name) { if (typeof value !== 'string' || !DIGEST.test(value)) fail(`${name} must be a lowercase bytes32 digest`); }
function scanForbidden(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_CONTENT_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''))) fail(`source content field ${path}.${key} is not accepted; submit a class, reference or commitment`);
    scanForbidden(item, `${path}.${key}`);
  }
}
function validateGovernanceEvent(event) {
  object(event, 'event');
  const bytes = Buffer.byteLength(JSON.stringify(event), 'utf8');
  if (bytes > MAX_EVENT_BYTES) fail(`serialized event exceeds ${MAX_EVENT_BYTES} bytes`);
  scanForbidden(event);
  onlyKeys(event, ['schema', 'schemaVersion', 'profile', 'tenantRef', 'projectRef', 'environment', 'eventId', 'streamRef', 'runRef', 'caseRef', 'sequence', 'occurredAt', 'receivedAt', 'eventType', 'source', 'agentRef', 'model', 'policy', 'activity', 'result', 'outcome', 'monitor', 'evidenceRefs', 'parentEventRefs'], 'event');
  if (event.schema !== 'aichain.governance-event' || event.schemaVersion !== '0.1.0-draft') fail('unsupported schema/version');
  if (typeof event.profile !== 'string' || event.profile.length>128 || !/^(urn:|https:\/\/)[^\s]+$/.test(event.profile)) fail('profile must be a versioned profile URI');
  for (const key of ['tenantRef', 'projectRef', 'eventId', 'streamRef']) ref(event[key], key);
  if (typeof event.environment !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(event.environment)) fail('environment is invalid');
  for (const key of ['runRef', 'caseRef', 'agentRef']) if (event[key] !== undefined) ref(event[key], key);
  if (event.sequence !== undefined && (typeof event.sequence!=='string' || !/^(0|[1-9][0-9]{0,19})$/.test(event.sequence))) fail('sequence must be a decimal string');
  if (event.sequence === undefined) fail('sequence is required');
  time(event.occurredAt, 'occurredAt'); time(event.receivedAt, 'receivedAt');
  if (!EVENT_TYPES.has(event.eventType)) fail('unsupported eventType');
  onlyKeys(event.source, ['kind', 'integrationVersion', 'keyRef', 'signatureRef'], 'source');
  if (!['customer-sdk', 'customer-gateway', 'independent-monitor', 'downstream-system', 'human-reviewer', 'provider-attestation'].includes(event.source.kind)) fail('source.kind is unsupported');
  for (const key of ['integrationVersion', 'keyRef']) ref(event.source[key], `source.${key}`);
  if (event.source.signatureRef !== undefined) ref(event.source.signatureRef, 'source.signatureRef');

  if (event.model !== undefined) {
    onlyKeys(event.model, ['providerRef', 'modelRef', 'deploymentRef', 'configVersion', 'approvedConfigDigest', 'observedConfigDigest', 'observationSource'], 'model');
    for (const key of ['providerRef', 'modelRef', 'deploymentRef', 'configVersion']) ref(event.model[key], `model.${key}`);
    for (const key of ['approvedConfigDigest', 'observedConfigDigest']) if (event.model[key] !== undefined) digest(event.model[key], `model.${key}`);
    if (event.model.observationSource !== undefined) ref(event.model.observationSource, 'model.observationSource');
  }
  if (event.policy !== undefined) {
    onlyKeys(event.policy, ['policyRef', 'version', 'decision', 'ruleRefs'], 'policy');
    ref(event.policy.policyRef, 'policy.policyRef'); ref(event.policy.version, 'policy.version');
    if (event.policy.decision !== undefined && !['allow', 'deny', 'review', 'not-applicable'].includes(event.policy.decision)) fail('policy.decision is invalid');
    if (event.policy.ruleRefs !== undefined) { if (!Array.isArray(event.policy.ruleRefs) || event.policy.ruleRefs.length > 32 || new Set(event.policy.ruleRefs).size !== event.policy.ruleRefs.length) fail('policy.ruleRefs must contain at most 32 unique items'); event.policy.ruleRefs.forEach((v) => ref(v, 'policy.ruleRefs[]')); }
  }
  if (event.activity !== undefined) {
    onlyKeys(event.activity, ['taskClass', 'promptTemplateRef', 'inputClass', 'outputClass', 'retrievalCount', 'toolCalls', 'latencyMs', 'tokenBand', 'costBand'], 'activity');
    for (const key of ['taskClass', 'promptTemplateRef', 'inputClass', 'outputClass']) if (event.activity[key] !== undefined) ref(event.activity[key], `activity.${key}`);
    for (const key of ['retrievalCount', 'latencyMs']) {
      const max = key === 'retrievalCount' ? 1_000_000 : 86_400_000;
      if (event.activity[key] !== undefined && (!Number.isSafeInteger(event.activity[key]) || event.activity[key] < 0 || event.activity[key] > max)) fail(`activity.${key} must be between 0 and ${max}`);
    }
    if (event.activity.tokenBand !== undefined && !['0-1k', '1k-2k', '2k-4k', '4k-8k', '8k-16k', '16k+', 'unknown'].includes(event.activity.tokenBand)) fail('activity.tokenBand is invalid');
    if (event.activity.costBand !== undefined && !['0-0.001', '0.001-0.01', '0.01-0.1', '0.1+', 'unknown'].includes(event.activity.costBand)) fail('activity.costBand is invalid');
    if (event.activity.toolCalls !== undefined) {
      if (!Array.isArray(event.activity.toolCalls) || event.activity.toolCalls.length > 100) fail('activity.toolCalls must contain at most 100 items');
      event.activity.toolCalls.forEach((call) => { onlyKeys(call, ['toolRef', 'version', 'resultCode', 'allowed'], 'activity.toolCalls[]'); for (const key of ['toolRef', 'version', 'resultCode']) ref(call[key], `activity.toolCalls[].${key}`); if (call.allowed !== undefined && typeof call.allowed !== 'boolean') fail('tool allowed must be boolean'); });
    }
  }
  if (event.result !== undefined) {
    onlyKeys(event.result, ['decisionCode', 'predictedLabel', 'actionCode', 'status'], 'result');
    for (const key of ['decisionCode', 'predictedLabel', 'actionCode']) if (event.result[key] !== undefined) ref(event.result[key], `result.${key}`);
    if (event.result.status !== undefined && !['completed', 'blocked', 'escalated', 'failed', 'pending'].includes(event.result.status)) fail('result.status is invalid');
  }
  if (event.outcome !== undefined) {
    onlyKeys(event.outcome, ['forEventId', 'label', 'labelSource', 'evaluatorRef', 'rubricVersion', 'adjudicatedAt'], 'outcome');
    for (const key of ['forEventId', 'label', 'evaluatorRef']) ref(event.outcome[key], `outcome.${key}`);
    if (!['human-adjudication', 'downstream-system', 'calibrated-measurement', 'customer-feedback', 'automated-evaluator'].includes(event.outcome.labelSource)) fail('outcome.labelSource is invalid');
    if (event.outcome.rubricVersion !== undefined) ref(event.outcome.rubricVersion, 'outcome.rubricVersion');
    if (event.outcome.adjudicatedAt !== undefined) time(event.outcome.adjudicatedAt, 'outcome.adjudicatedAt');
  }
  if (event.monitor !== undefined) {
    onlyKeys(event.monitor, ['monitorRef', 'signalCode', 'severity', 'expectedDigest', 'observedDigest', 'disposition'], 'monitor');
    for (const key of ['monitorRef', 'signalCode']) ref(event.monitor[key], `monitor.${key}`);
    if (!['info', 'low', 'medium', 'high', 'critical'].includes(event.monitor.severity)) fail('monitor.severity is invalid');
    for (const key of ['expectedDigest', 'observedDigest']) if (event.monitor[key] !== undefined) digest(event.monitor[key], `monitor.${key}`);
    if (event.monitor.disposition !== undefined && !['open', 'acknowledged', 'investigating', 'mitigated', 'closed', 'false-positive'].includes(event.monitor.disposition)) fail('monitor.disposition is invalid');
  }
  if (event.evidenceRefs !== undefined) {
    if (!Array.isArray(event.evidenceRefs) || event.evidenceRefs.length > 20) fail('evidenceRefs must contain at most 20 items');
    event.evidenceRefs.forEach((item) => { onlyKeys(item, ['role', 'commitment', 'availability'], 'evidenceRefs[]'); ref(item.role, 'evidenceRefs[].role'); digest(item.commitment, 'evidenceRefs[].commitment'); if (!['customer-held', 'customer-controlled-reference', 'not-disclosed', 'deleted-under-policy'].includes(item.availability)) fail('evidence availability is invalid'); });
  }
  if (event.parentEventRefs !== undefined) { if (!Array.isArray(event.parentEventRefs) || event.parentEventRefs.length > 64 || new Set(event.parentEventRefs).size !== event.parentEventRefs.length) fail('parentEventRefs is invalid'); event.parentEventRefs.forEach((v) => ref(v, 'parentEventRefs[]')); }
  const requiredByType = {
    'ai.run.completed': ['runRef', 'agentRef', 'model', 'activity', 'result'],
    'ai.policy.evaluated': ['runRef', 'policy'],
    'ai.human.reviewed': ['runRef', 'agentRef', 'result'],
    'ai.outcome.adjudicated': ['caseRef', 'outcome'],
    'ai.runtime.config-observed': ['agentRef', 'model'],
    'ai.monitor.alerted': ['agentRef', 'monitor']
  }[event.eventType];
  for (const key of requiredByType) if (event[key] === undefined) fail(`${event.eventType} requires ${key}`);
  return { valid: true, bytes, eventId: event.eventId, eventType: event.eventType };
}

function adjudicatedAccuracy(events, { minimumSampleSize = 30 } = {}) {
  const runs = new Map(); const labels = new Map();
  for (const event of events) {
    if (event.eventType === 'ai.run.completed' && event.model && event.result?.predictedLabel) runs.set(event.eventId, event);
    if (event.eventType === 'ai.outcome.adjudicated' && ['human-adjudication', 'calibrated-measurement'].includes(event.outcome?.labelSource)) {
      const values = labels.get(event.outcome.forEventId) || [];
      values.push(event.outcome.label); labels.set(event.outcome.forEventId, values);
    }
  }
  const groups = new Map();
  for (const [eventId, run] of runs) {
    const key = [run.profile, run.model.deploymentRef, run.activity?.taskClass || 'unknown'].join('|');
    const group = groups.get(key) || { profile: run.profile, deploymentRef: run.model.deploymentRef, taskClass: run.activity?.taskClass || 'unknown', correct: 0, total: 0, runCount: 0, unlabelled: 0, ambiguousLabels: 0 };
    group.runCount += 1;
    const matchingLabels = labels.get(eventId) || [];
    if (matchingLabels.length === 1) { group.total += 1; if (run.result.predictedLabel === matchingLabels[0]) group.correct += 1; }
    else if (matchingLabels.length === 0) group.unlabelled += 1;
    else group.ambiguousLabels += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.deploymentRef.localeCompare(b.deploymentRef)).map((group) => {
    const conflict = group.ambiguousLabels > 0;
    return { ...group, rate: !conflict && group.total >= minimumSampleSize ? group.correct / group.total : null, status: conflict ? 'conflicting-labels' : group.total >= minimumSampleSize ? 'reportable' : 'insufficient-sample' };
  });
}

module.exports = { MAX_EVENT_BYTES, validateGovernanceEvent, adjudicatedAccuracy };
