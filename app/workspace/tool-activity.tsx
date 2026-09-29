export type ToolObservation = {toolRef:string;version:string;resultCode:string;allowed?:boolean};
export type ToolActivity = {toolCalls?:ToolObservation[]};

export default function ToolActivityPanel({activity}:{activity?:ToolActivity}) {
 const tools=activity?.toolCalls;
 return <section className="gp-panel" aria-label="Recorded tool activity">
  <h3>Recorded tool activity</h3>
  {!tools?.length?<p>No tool observations were supplied for this record. This does not establish that no tools ran.</p>:<>
   <p>{tools.length} tool observations attached to this run. Listed in capture order; individual tool timestamps and durations are not supplied.</p>
   <div className="gp-table-wrap"><table><thead><tr><th>Tool reference</th><th>Version</th><th>Recorded outcome</th><th>Declared permission</th></tr></thead>
   <tbody>{tools.map((tool,index)=><tr key={index}><td>{tool.toolRef}</td><td>{tool.version}</td><td>{tool.resultCode}</td><td>{tool.allowed===undefined?'Not supplied':tool.allowed?'Customer reports allowed':'Customer reports not allowed'}</td></tr>)}</tbody></table></div>
  </>}
  <p>These are customer-submitted observations. Successful execution does not prove a tool was permitted or a control was enforced. Receipt and chain checks cover record integrity, not complete activity coverage.</p>
 </section>;
}
