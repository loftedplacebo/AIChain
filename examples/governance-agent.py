"""Submit one synthetic agent deployment, heartbeat and run to a local/test API.

Set ORVESSIAN_API_URL, ORVESSIAN_TOKEN, ORVESSIAN_TENANT, ORVESSIAN_PROJECT.
This fixed example is replayable. Real integrations must persist event identity,
sequence and occurred_at before sending, and persist heartbeat sequence separately.
"""
import os
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sdk' / 'python'))
from orvessian_ingest import Client

client = Client(os.environ['ORVESSIAN_API_URL'], os.environ['ORVESSIAN_TOKEN'],
                os.environ['ORVESSIAN_TENANT'], os.environ['ORVESSIAN_PROJECT'])
deployment = dict(agent_ref='synthetic-classifier', environment='test', deployment_ref='synthetic-v1')
client.register_agent(**deployment, owner_ref='demo-team', purpose='Synthetic classification example',
                      model_ref='synthetic-model', config_version='v1')
client.heartbeat(**deployment, sequence=1)
result = client.record_run(**deployment, event_id='sdk-example-1', stream_ref='sdk-example', sequence=1,
                          run_ref='sdk-run-1', provider_ref='synthetic', model_ref='synthetic-model',
                          config_version='v1', task_class='classification', status='completed',
                          occurred_at='2026-09-27T12:00:00.000Z', latency_ms=25, predicted_label='approved')
print(json.dumps({'submission': result, 'registry': client.agents()}))
