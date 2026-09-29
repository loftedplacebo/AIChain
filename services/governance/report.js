const scope = e => JSON.stringify([e.tenantRef, e.projectRef, e.environment, e.profile]);
const eventKey = e => `${scope(e)}:${e.eventId}`;
const ratio = (n, d) => d ? n / d : null;
function buildReport(events, { minimumSampleSize = 30 } = {}) {
  const runs = events.filter(e => e.eventType === 'ai.run.completed');
  const labels = new Map();
  for (const e of events.filter(e => e.eventType === 'ai.outcome.adjudicated')) {
    const key = `${scope(e)}:${e.outcome.forEventId}`;
    const list = labels.get(key) || []; list.push(e); labels.set(key, list);
  }
  const models = new Map(); const trends = new Map();
  for (const e of runs) {
    const key = JSON.stringify([scope(e), e.model.deploymentRef, e.model.configVersion, e.activity.taskClass || 'unspecified']);
    const group = models.get(key) || { key, deployment: e.model.deploymentRef, configuration: e.model.configVersion, task: e.activity.taskClass || 'unspecified', runs: 0, labelled: 0, correct: 0, pending: 0, conflicting: 0, excluded: 0, latency: [], rubrics: new Set() };
    group.runs++;
    if (Number.isFinite(e.activity.latencyMs)) group.latency.push(e.activity.latencyMs);
    const linked = labels.get(eventKey(e)) || [];
    if (!linked.length) group.pending++;
    else if (linked.length !== 1) group.conflicting++;
    else {
      const label = linked[0];
      if (!['human-adjudication', 'calibrated-measurement'].includes(label.outcome.labelSource) || !label.outcome.rubricVersion || !e.result.predictedLabel || label.caseRef !== e.caseRef) group.excluded++;
      else { group.labelled++; group.correct += Number(label.outcome.label === e.result.predictedLabel); group.rubrics.add(`${label.outcome.labelSource}/${label.outcome.evaluatorRef}/${label.outcome.rubricVersion}`); }
    }
    models.set(key, group);
    const day = e.occurredAt.slice(0, 10); const daily = trends.get(day) || { day, runs: 0, failures: 0 };
    daily.runs++; daily.failures += Number(e.result.status === 'failed'); trends.set(day, daily);
  }
  const modelReports = [...models.values()].map(g => {
    const reason = g.conflicting ? 'conflicting-labels' : g.rubrics.size > 1 ? 'mixed-evaluators' : g.labelled < minimumSampleSize ? 'insufficient-sample' : 'reportable';
    const sorted = g.latency.sort((a,b) => a-b);
    return { ...g, latency: undefined, rubrics: [...g.rubrics], accuracy: reason === 'reportable' ? ratio(g.correct, g.labelled) : null, accuracyStatus: reason, p95LatencyMs: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null };
  });
  const policyEvents = events.filter(e => e.eventType === 'ai.policy.evaluated' && ['allow','deny','review'].includes(e.policy?.decision));
  const alerts = events.filter(e => e.eventType === 'ai.monitor.alerted').map(e => ({ eventId: e.eventId, agent: e.agentRef, occurredAt: e.occurredAt, signal: e.monitor.signalCode, severity: e.monitor.severity, disposition: e.monitor.disposition || 'open', source: e.source.kind, expectedDigest: e.monitor.expectedDigest || null, observedDigest: e.monitor.observedDigest || null }));
  return {
    schemaVersion: '0.1.0-draft', eventCount: events.length, minimumSampleSize,
    definitions: {
      accuracy: {id:'quality.adjudicated-label-accuracy',version:'1.0.0',formula:'correct / eligible linked labels',suppressedWhen:['fewer than minimumSampleSize labels','multiple labels for a run','mixed label sources, evaluators or rubrics'],excluded:['automated evaluator','customer feedback','missing rubric','case mismatch']},
      p95Latency: {formula:'nearest-rank 95th percentile of supplied run latencyMs',missing:'excluded; null when no measurements'},
      agentsReporting: {formula:'distinct agentRef among selected model runs',meaning:'observed in records, not a running-agent heartbeat count'}
    },
    kpis: { agentsReporting: new Set(runs.map(e => e.agentRef)).size, runs: runs.length, modelDeployments: new Set(runs.map(e => e.model.deploymentRef)).size, policyEvaluations: policyEvents.length, denied: policyEvents.filter(e => e.policy.decision === 'deny').length, reviewedLabels: modelReports.reduce((a,m)=>a+m.labelled,0), openAlerts: alerts.filter(a => !['closed','false-positive'].includes(a.disposition)).length },
    models: modelReports, trends: [...trends.values()].sort((a,b)=>a.day.localeCompare(b.day)), alerts,
    assurance: { signatures: 'not-verified', anchoring: 'not-submitted', runningAgents: 'unknown-no-heartbeat-inventory', sourceContent: 'customer-held', comparison: 'Descriptive cohorts; a difference does not establish the effect of switching models.' }
  };
}
module.exports = { buildReport };
