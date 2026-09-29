export interface ClientOptions {baseUrl:string;token:string;tenant:string;project:string;timeoutMs?:number;attempts?:number}
export interface Registration {agentRef:string;environment:string;deploymentRef:string;ownerRef:string;purpose:string;modelRef:string;configVersion:string;heartbeatTtlSeconds?:number}
export interface Run {eventId:string;streamRef:string;sequence:string|number;occurredAt:string;runRef:string;agentRef:string;environment:string;deploymentRef:string;providerRef:string;modelRef:string;configVersion:string;taskClass:string;status:'completed'|'blocked'|'escalated'|'failed'|'pending';latencyMs?:number;predictedLabel?:string;decisionCode?:string;caseRef?:string;toolCalls?:{toolRef:string;version:string;resultCode:string;allowed?:boolean}[];actionCode?:string;parentEventRefs?:string[]}
export interface Acceptance {eventId:string;status:'accepted'|'duplicate';anchorStatus:string;receivedAt?:string}
export interface Outcome {eventId:string;forEventId:string;caseRef:string;environment:string;label:string;labelSource:'downstream-system'|'calibrated-measurement'|'customer-feedback'|'automated-evaluator';evaluatorRef:string;rubricVersion:string;occurredAt:string}
export interface ConfigObservation {eventId:string;streamRef:string;sequence:string|number;occurredAt:string;agentRef:string;environment:string;deploymentRef:string;providerRef:string;modelRef:string;configVersion:string;observedConfigDigest:string;approvedConfigDigest?:string;observationSource:string;parentEventRefs?:string[]}
/** Versioned governance event. Validated against the strict runtime contract. */
export type GovernanceEvent = Record<string,unknown> & {tenantRef:string;projectRef:string;eventId:string;occurredAt:string};
export class IngestionError extends Error {status?:number}
export class Client {
 constructor(options:ClientOptions,fetcher?:typeof fetch);
 readonly baseUrl:string;readonly tenant:string;readonly project:string;
 registerAgent(input:Registration):Promise<unknown>;
 heartbeat(input:{agentRef:string;environment:string;deploymentRef:string;sequence:number}):Promise<unknown>;
 buildRun(input:Run):GovernanceEvent;
 buildOutcome(input:Outcome):GovernanceEvent;
 buildConfigObservation(input:ConfigObservation):GovernanceEvent;
 submit(event:GovernanceEvent):Promise<Acceptance>;
 recordRun(input:Run):Promise<Acceptance>;
 recordOutcome(input:Outcome):Promise<Acceptance>;
 recordConfigObservation(input:ConfigObservation):Promise<Acceptance>;
 agents(options?:{limit?:number;offset?:number}):Promise<unknown>;
 evidence(eventId:string):Promise<unknown>;
}
export const VERSION:string;
