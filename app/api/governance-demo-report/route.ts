import demo from '../../../public/governance-demo.json';
export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const days=params.get('days')||'14',deployment=params.get('deployment')||'all',format=params.get('format')||'json';
  const view=demo.views.find(v=>v.key===`${days}:${deployment}`);
  if(!view||!['json','csv'].includes(format))return Response.json({error:'Unknown demonstration report'},{status:400});
  const headers={'cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':`attachment; filename="orvessian-synthetic-report-${days}d.${format}"`};
  if(format==='csv'){
    const quote=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
    const rows=[['deployment','task','runs','labelled','correct','accuracy','status'],...view.report.models.map(m=>[m.deployment,m.task,m.runs,m.labelled,m.correct,m.accuracy,m.accuracyStatus])];
    return new Response(rows.map(row=>row.map(quote).join(',')).join('\r\n'),{headers:{...headers,'content-type':'text/csv;charset=utf-8'}});
  }
  return Response.json({synthetic:true,asOf:demo.asOf,from:view.from,to:view.to,deployment,labelPolicy:demo.labelPolicy,supportingEvents:'/governance-demo-events.json',report:view.report},{headers});
}
