import {Client,GovernanceEvent} from './orvessian-ingest';
export interface ImportCheckpoint {revision:number;cursor:string|null;complete:boolean}
export class DurableQueue {
 constructor(client: Client, path: string, options?: {capacity?: number});
 readonly size: number;
 enqueue(event: GovernanceEvent): boolean;
 checkpoint(id:string,binding:string):ImportCheckpoint;
 commitImportPage(id:string,binding:string,expectedRevision:number,events:GovernanceEvent[],nextCursor:string|null):ImportCheckpoint;
 flush(options?: {limit?: number}): Promise<{delivered: number; pending: number}>;
 close(): void;
}
