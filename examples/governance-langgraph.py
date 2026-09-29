"""Actual LangGraph, synthetic node, no provider credentials or inference costs.

Set the four ORVESSIAN_* client variables as in governance-agent.py and
ORVESSIAN_QUEUE_PATH to a customer-owned local SQLite path. No source payload is
sent to Orvessian. The node can be replaced by customer inference code.
"""
import json
import os
import sys
from pathlib import Path
from typing import TypedDict
from uuid import uuid4
from datetime import datetime, timezone

# This example deliberately does not export payloads to a third-party trace service.
os.environ['LANGSMITH_TRACING'] = 'false'
os.environ['LANGCHAIN_TRACING_V2'] = 'false'
if '--installed-sdk' not in sys.argv:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sdk' / 'python'))
from langgraph.graph import StateGraph, START, END
from langchain_core.tools import tool
from orvessian_ingest import Client
from orvessian_langchain import DeliveryQueue, GovernanceCallback

client = Client(os.environ['ORVESSIAN_API_URL'], os.environ['ORVESSIAN_TOKEN'],
                os.environ['ORVESSIAN_TENANT'], os.environ['ORVESSIAN_PROJECT'])
queue = DeliveryQueue(os.environ['ORVESSIAN_QUEUE_PATH'], client)
identity = dict(agent_ref='framework-agent', environment='test', deployment_ref='framework-v1',
                provider_ref='synthetic', model_ref='synthetic-classifier', config_version='v1',
                task_class='workflow-invocation')
client.register_agent(agent_ref=identity['agent_ref'], environment='test', deployment_ref=identity['deployment_ref'],
                      owner_ref='demo-team', purpose='Synthetic framework integration',
                      model_ref=identity['model_ref'], config_version='v1')

class State(TypedDict):
    private_text: str
    decision: str

builder = StateGraph(State)
@tool
def synthetic_lookup(text: str) -> str:
    """Customer-held synthetic lookup; contents are never exported."""
    return text

def classify(state, config):
    synthetic_lookup.invoke(state['private_text'], config)
    handler.set_decision('review')
    return {'decision':'review'}
builder.add_node('classify', classify)
builder.add_edge(START, 'classify')
builder.add_edge('classify', END)
handler = GovernanceCallback(queue, run_id=uuid4(), case_ref='synthetic-case-1', decision_labels=('approve','review','reject'),
                             tool_catalog={'synthetic_lookup':{'toolRef':'case-lookup','version':'v1'}}, **identity)
try:
    builder.compile().invoke({'private_text':'synthetic-source-content-not-exported', 'decision':''},
                             {'callbacks':[handler], 'run_id':handler.run_id})
    if handler.capture_status != 'queued':
        raise RuntimeError('Governance capture incomplete: '+handler.capture_status)
    if '--with-outcome' in sys.argv:
        queue.enqueue_outcome(event_id='review-'+str(handler.run_id),for_event_id='lc-'+str(handler.run_id),
                              case_ref='synthetic-case-1',environment='test',label='review',
                              label_source='automated-evaluator',evaluator_ref='synthetic-test-rule',
                              rubric_version='v1',occurred_at=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))
    acknowledged = queue.flush()
    result = {'runRef':str(handler.run_id), 'eventId':'lc-'+str(handler.run_id),
              'capture':handler.capture_status, 'acknowledged':acknowledged, 'pending':queue.pending}
    if '--installed-sdk' in sys.argv:
        import importlib.metadata
        import orvessian_ingest, orvessian_delivery, orvessian_langchain
        result['sdkVersion'] = importlib.metadata.version('orvessian-ingestion')
        result['sdkModules'] = {module.__name__: str(Path(module.__file__).resolve())
                                for module in (orvessian_ingest, orvessian_delivery, orvessian_langchain)}
    print(json.dumps(result))
finally:
    queue.close()
