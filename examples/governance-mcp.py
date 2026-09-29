"""Synthetic in-process MCP tool within a real agent root; no external tools."""
import asyncio
import json
import os
import sys
from pathlib import Path
from uuid import uuid4
os.environ['LANGSMITH_TRACING']='false'
os.environ['LANGCHAIN_TRACING_V2']='false'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'sdk'/'python'))
from mcp import Client as McpClient
from mcp.server import MCPServer
from mcp.client.stdio import StdioServerParameters
from langchain_core.runnables import RunnableLambda
from orvessian_ingest import Client
from orvessian_delivery import DeliveryQueue
from orvessian_langchain import GovernanceCallback
from orvessian_mcp import GovernanceMcpClient

async def main():
    client=Client(os.environ['ORVESSIAN_API_URL'],os.environ['ORVESSIAN_TOKEN'],os.environ['ORVESSIAN_TENANT'],os.environ['ORVESSIAN_PROJECT'])
    queue=DeliveryQueue(os.environ['ORVESSIAN_QUEUE_PATH'],client)
    handler=GovernanceCallback(queue,run_id=uuid4(),agent_ref='mcp-agent',environment='test',deployment_ref='mcp-v1',provider_ref='synthetic',model_ref='synthetic-model',config_version='v1',task_class='agent-workflow')
    server=MCPServer('synthetic')
    @server.tool()
    def lookup(text:str)->str:return text
    try:
        transport = StdioServerParameters(command=sys.executable,args=[str(Path(__file__).resolve().with_name('mcp-synthetic-server.py'))]) if '--stdio-test' in sys.argv else server
        async with McpClient(transport,mode='legacy',read_timeout_seconds=5) as session:
            monitored=GovernanceMcpClient(session,handler,tool_catalog={'lookup':{'toolRef':'server-a.lookup','version':'v1'}})
            async def workflow(value):
                await monitored.call_tool('lookup',{'text':value})
                return value
            await RunnableLambda(workflow).ainvoke('PRIVATE-MCP-CONTENT',{'callbacks':[handler],'run_id':handler.run_id})
            if handler.capture_status!='queued' or monitored.metrics['capture_failed']:
                raise RuntimeError('MCP capture incomplete')
        acknowledged=queue.flush()
        print(json.dumps({'eventId':'lc-'+str(handler.run_id),'acknowledged':acknowledged}))
    finally:queue.close()
asyncio.run(asyncio.wait_for(main(),timeout=20))
