// Shared customer response handling. Reauthentication is an explicit rejected
// action, never an instruction to replay a mutation or discard the read session.
export async function readWorkspaceResponse(response,{signal,onReauthenticationRequired}={}){
 const body=await response.json();
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(!response.ok){
  const error=new Error(typeof body?.error==='string'?body.error:'Workspace request failed');
  if(response.status===403&&body?.code==='reauthentication-required'){
   error.code='reauthentication-required';onReauthenticationRequired?.();
  }
  if(response.status===429){
   const header=response.headers.get('retry-after'),seconds=/^[1-9][0-9]{0,4}$/.test(header||'')?Number(header):body?.retryAfter;
   error.code='request-limit';if(Number.isInteger(seconds)&&seconds>=1&&seconds<=86400)error.retryAfter=seconds;
   error.message+=error.retryAfter?` Try again in ${error.retryAfter} ${error.retryAfter===1?'second':'seconds'}.`:' Please wait before trying again.';
  }
  throw error;
 }
 return body;
}
export function mutationErrorMessage(error,retryAdvice){
 return (error?.message||'Workspace request failed')+(['reauthentication-required','request-limit'].includes(error?.code)?'':retryAdvice);
}
