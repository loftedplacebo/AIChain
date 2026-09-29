import {Client,GovernanceEvent,Run} from './orvessian-ingest';
export type SpanContext=Pick<Run,'agentRef'|'environment'|'deploymentRef'|'providerRef'|'modelRef'|'configVersion'|'taskClass'|'caseRef'|'decisionCode'|'predictedLabel'>;
export interface OtlpJsonSpan {traceId:string;spanId:string;startTimeUnixNano:string;endTimeUnixNano:string;status:{code:1|2|'STATUS_CODE_OK'|'STATUS_CODE_ERROR';message?:string};[key:string]:unknown}
export function mapOtlpSpan(client:Client,span:OtlpJsonSpan,context:SpanContext):GovernanceEvent;
export interface EvaluationRow {evaluationId:string;forEventId:string;caseRef:string;label:string;occurredAt:string}
export function mapEvaluationRows(client:Client,rows:EvaluationRow[],options:{environment:string;evaluatorRef:string;rubricVersion:string}):GovernanceEvent[];
