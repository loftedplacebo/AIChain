import {workosGateway} from '../../../../lib/workos-gateway.js';
export const dynamic='force-dynamic';
export function GET(request:Request){return workosGateway(request,{origin:process.env.WORKSPACE_ORIGIN,api:process.env.GOVERNANCE_API_URL});}
