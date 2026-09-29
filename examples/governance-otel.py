"""Real OpenTelemetry SDK with synthetic content; no provider or chain calls."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'sdk'/'python'))
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import Status,StatusCode
from orvessian_ingest import Client
from orvessian_delivery import DeliveryQueue
from orvessian_otel import GovernanceSpanExporter

client=Client(os.environ['ORVESSIAN_API_URL'],os.environ['ORVESSIAN_TOKEN'],
              os.environ['ORVESSIAN_TENANT'],os.environ['ORVESSIAN_PROJECT'])
queue=DeliveryQueue(os.environ['ORVESSIAN_QUEUE_PATH'],client)
exporter=GovernanceSpanExporter(queue,instrumentation_scope='approved-tracer',agent_ref='otel-agent',
    environment='test',deployment_ref='otel-v1',provider_ref='synthetic',model_ref='synthetic-model',
    config_version='v1',task_class='workflow-invocation')
provider=TracerProvider(resource=Resource.create({'private':'PRIVATE-OTEL-CONTENT'}))
provider.add_span_processor(SimpleSpanProcessor(exporter))
try:
    with provider.get_tracer('approved-tracer').start_as_current_span('PRIVATE-OTEL-CONTENT',attributes={'private':'PRIVATE-OTEL-CONTENT'}) as span:
        span.add_event('PRIVATE-OTEL-CONTENT');span.set_status(Status(StatusCode.OK))
    if exporter.metrics['queued']!=1: raise RuntimeError('Telemetry capture incomplete')
    event_id=exporter.last_event_id
    acknowledged=queue.flush()
    print(json.dumps({'eventId':event_id,'acknowledged':acknowledged,'metrics':exporter.metrics}))
finally:
    provider.shutdown();queue.close()
