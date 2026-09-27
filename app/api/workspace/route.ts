import { workspaceGateway } from '../../../lib/workspace-gateway.js';
export const dynamic='force-dynamic';
function handle(request:Request){return workspaceGateway(request,{origin:process.env.WORKSPACE_ORIGIN,api:process.env.GOVERNANCE_API_URL});}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
