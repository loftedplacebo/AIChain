import asyncio
import json
import os
import tempfile
import sys
from pathlib import Path
from unittest.mock import patch
import unittest
from types import SimpleNamespace
from uuid import uuid4
os.environ['LANGSMITH_TRACING']='false'
os.environ['LANGCHAIN_TRACING_V2']='false'
try:
    from mcp import Client,types
except ImportError:
    raise unittest.SkipTest('Install requirements-mcp.txt in the MCP test environment')
from mcp.server import MCPServer
from mcp.client.stdio import StdioServerParameters
from langchain_core.runnables import RunnableLambda
from orvessian_langchain import GovernanceCallback
from orvessian_delivery import DeliveryQueue
from orvessian_mcp import GovernanceMcpClient

SECRET='PRIVATE-MCP-ARGUMENT-RESULT-DO-NOT-CAPTURE'
IDENTITY=dict(agent_ref='a',environment='test',deployment_ref='d',provider_ref='synthetic',model_ref='m',config_version='v1',task_class='agent-workflow')
class RecordingClient:
    base_url='http://127.0.0.1'
    tenant='t'
    project='p'
    def __init__(self):self.records=[]
    def record_run(self,**record):self.records.append(record);return {'eventId':record['event_id'],'status':'accepted'}

class McpTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.client=RecordingClient();self.queue=DeliveryQueue(os.path.join(self.temp.name,'q.sqlite'),self.client)
    def tearDown(self):self.queue.close();self.temp.cleanup()
    def observer(self):return GovernanceCallback(self.queue,run_id=uuid4(),**IDENTITY)
    def test_actual_mcp_clients_and_root_workflow_exclude_arguments_and_results(self):
        server=MCPServer('synthetic')
        @server.tool()
        def lookup(text:str)->str:return text
        @server.tool()
        def failed()->types.CallToolResult:return types.CallToolResult(content=[types.TextContent(type='text',text=SECRET)],is_error=True)
        async def run(mode):
            h=self.observer()
            async with Client(server,mode=mode) as session:
                wrapper=GovernanceMcpClient(session,h,tool_catalog={'lookup':{'toolRef':'server-a.lookup','version':'v1'},'failed':{'toolRef':'server-a.failed','version':'v1'}})
                async def workflow(value):
                    result=await wrapper.call_tool('lookup',{'text':value})
                    self.assertIn(SECRET,str(result.content))
                    failed_result=await wrapper.call_tool('failed',{})
                    self.assertTrue(failed_result.is_error)
                    return SECRET
                self.assertEqual(await RunnableLambda(workflow).ainvoke(SECRET,{'callbacks':[h],'run_id':h.run_id}),SECRET)
                self.assertEqual(wrapper.metrics['capture_failed'],0)
            self.assertEqual(h.capture_status,'queued');self.queue.flush()
            self.assertEqual(self.client.records[-1]['tool_calls'],[{'toolRef':'server-a.lookup','version':'v1','resultCode':'completed'},{'toolRef':'server-a.failed','version':'v1','resultCode':'failed'}])
            self.assertNotIn(SECRET,json.dumps(self.client.records))
        asyncio.run(run('auto'));asyncio.run(run('legacy'));self.assertEqual(len(self.client.records),2)
    def test_nonterminal_unmapped_and_cancelled_calls_preserve_customer_semantics(self):
        h=self.observer();h.on_chain_start(None,SECRET,run_id=h.run_id)
        class Session:
            async def call_tool(self,name,arguments,**kwargs):
                if name=='cancel':raise asyncio.CancelledError()
                return SimpleNamespace(result_type='input_required',content=SECRET)
        wrapper=GovernanceMcpClient(Session(),h,tool_catalog={'pending':{'toolRef':'s.pending','version':'v1'},'cancel':{'toolRef':'s.cancel','version':'v1'}})
        async def run():
            await wrapper.call_tool('pending',{'private':SECRET});await wrapper.call_tool('unknown',{'private':SECRET})
            with self.assertRaises(asyncio.CancelledError):await wrapper.call_tool('cancel',{'private':SECRET})
        asyncio.run(run());h.on_chain_end(SECRET,run_id=h.run_id);self.queue.flush()
        self.assertEqual([c['resultCode'] for c in self.client.records[-1]['tool_calls']],['pending','interrupted']);self.assertEqual(wrapper.metrics['skipped_unmapped'],1);self.assertEqual(wrapper.metrics['pending'],2);self.assertNotIn(SECRET,json.dumps(self.client.records))
    def test_actual_stdio_process_transport_and_clean_shutdown(self):
        marker=Path(self.temp.name)/'server-exited.txt'
        parameters=StdioServerParameters(command=sys.executable,args=[str(Path(__file__).resolve().parents[2]/'examples'/'mcp-synthetic-server.py'),'--exit-marker',str(marker)])
        async def run():
            h=self.observer()
            async with Client(parameters,mode='legacy',read_timeout_seconds=5) as session:
                wrapper=GovernanceMcpClient(session,h,tool_catalog={'lookup':{'toolRef':'stdio.lookup','version':'v1'},'failed':{'toolRef':'stdio.failed','version':'v1'}})
                async def workflow(value):
                    identity=await wrapper.call_tool('process_identity',{})
                    self.assertNotEqual(identity.content[0].text,str(os.getpid()))
                    result=await wrapper.call_tool('lookup',{'text':value})
                    self.assertEqual(result.content[0].text,SECRET)
                    error=await wrapper.call_tool('failed',{})
                    self.assertTrue(error.is_error)
                    self.assertEqual(error.content[0].text,SECRET)
                    return value
                self.assertEqual(await RunnableLambda(workflow).ainvoke(SECRET,{'callbacks':[h],'run_id':h.run_id}),SECRET)
                self.assertEqual(wrapper.metrics['skipped_unmapped'],1)
                self.assertEqual(wrapper.metrics['capture_failed'],0)
            self.assertEqual(marker.read_text(encoding='utf-8'),'stopped')
            self.assertEqual(h.capture_status,'queued')
            self.queue.flush()
            self.assertEqual(self.client.records[-1]['tool_calls'],[{'toolRef':'stdio.lookup','version':'v1','resultCode':'completed'},{'toolRef':'stdio.failed','version':'v1','resultCode':'failed'}])
            self.assertNotIn(SECRET,json.dumps(self.client.records))
        with patch.dict(os.environ, {'ORVESSIAN_TOKEN':'synthetic-parent-token-not-for-tool-server'}):
            asyncio.run(asyncio.wait_for(run(),timeout=20))
    def test_root_lifecycle_and_overflow_are_visible_without_changing_tool_result(self):
        h=self.observer()
        class Session:
            async def call_tool(self,name,arguments,**kwargs):return SimpleNamespace(is_error=False,content=SECRET)
        wrapper=GovernanceMcpClient(Session(),h,tool_catalog={'lookup':{'toolRef':'s.lookup','version':'v1'}})
        asyncio.run(wrapper.call_tool('lookup',{}));self.assertEqual(wrapper.metrics['capture_failed'],1)
        h.on_chain_start(None,SECRET,run_id=h.run_id)
        async def run():
            for _ in range(101):await wrapper.call_tool('lookup',{})
        asyncio.run(run());self.assertEqual(h.tool_capture_status,'limited');self.assertEqual(wrapper.metrics['capture_failed'],2);h.on_chain_end(SECRET,run_id=h.run_id);self.queue.flush();self.assertEqual(len(self.client.records[-1]['tool_calls']),100)

if __name__=='__main__':unittest.main()
