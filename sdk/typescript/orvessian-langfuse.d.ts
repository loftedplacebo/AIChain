import {Client,GovernanceEvent} from './orvessian-ingest';
import {DurableQueue,ImportCheckpoint} from './orvessian-queue';
export interface LangfuseMappingOptions{environment:string;evaluatorRef:string;rubricVersion:string;vendorProjectId:string;scoreName:string;labelMap:Record<string,string>}
export type LangfuseSubject={kind:'trace';id:string}|{kind:'observation';id:string;traceId:string};
export interface LangfuseLink{subject:LangfuseSubject;forEventId:string;caseRef:string}
export interface LangfuseScore{ id:string;projectId:string;environment:string;name:string;dataType:'CATEGORICAL';value:string;timestamp:string;subject:LangfuseSubject;[key:string]:unknown }
export interface LangfuseScorePage{data:LangfuseScore[];meta?:{cursor?:string|null}}
export function mapLangfuseScorePage(client:Client,page:LangfuseScorePage,links:LangfuseLink[],options:{environment:string;evaluatorRef:string;rubricVersion:string;vendorProjectId:string;scoreName:string;labelMap:Record<string,string>}):{events:GovernanceEvent[];nextCursor:string|null};
export class LangfuseReadError extends Error{status?:number}
export class LangfuseScoresClient{
 readonly baseUrl:string;readonly scoreName:string;readonly environment:string;
 constructor(options:{baseUrl:string;publicKey:string;secretKey:string;scoreName:string;environment:string;timeoutMs?:number},fetcher?:typeof fetch);
 page(window:{from:string;to:string;after?:string|null}):Promise<LangfuseScorePage>;
}
export function importLangfuseWindow(client:Client,reader:LangfuseScoresClient,queue:DurableQueue,input:{importId:string;from:string;to:string;links:LangfuseLink[];options:LangfuseMappingOptions;maxPages?:number}):Promise<{pages:number;records:number;checkpoint:ImportCheckpoint}>;
