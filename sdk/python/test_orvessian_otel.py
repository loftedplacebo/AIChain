import json
import os
import tempfile
import unittest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, BatchSpanProcessor, SpanExportResult
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import Status, StatusCode
from orvessian_delivery import DeliveryQueue
from orvessian_otel import GovernanceSpanExporter

SECRET = 'PRIVATE-TELEMETRY-PAYLOAD-DO-NOT-CAPTURE'
IDENTITY = dict(instrumentation_scope='approved-tracer', agent_ref='a',environment='test',
                deployment_ref='d',provider_ref='synthetic',model_ref='m',config_version='v1',task_class='task')
class Client:
    base_url='http://127.0.0.1:8799'
    tenant='tenant'
    project='project'
    def __init__(self): self.records=[]
    def record_run(self, **record):
        self.records.append(record)
        return dict(eventId=record['event_id'],status='accepted')

class OtelTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.client=Client()
        self.queue=DeliveryQueue(os.path.join(self.temp.name,'queue.sqlite'),self.client,capacity=2)
        self.exporter=GovernanceSpanExporter(self.queue,**IDENTITY)
        self.provider=TracerProvider(resource=Resource.create({'private':SECRET}))
        self.provider.add_span_processor(SimpleSpanProcessor(self.exporter))
    def tearDown(self): self.provider.shutdown();self.queue.close();self.temp.cleanup()
    def test_real_spans_exclude_source_data_and_child_runs_and_replay(self):
        tracer=self.provider.get_tracer('approved-tracer')
        with tracer.start_as_current_span(SECRET,attributes={'private':SECRET}) as span:
            span.add_event(SECRET,{'private':SECRET});span.set_status(Status(StatusCode.OK))
            with tracer.start_as_current_span(SECRET) as child: child.set_status(Status(StatusCode.OK))
        with self.provider.get_tracer('foreign-tracer').start_as_current_span(SECRET) as foreign: foreign.set_status(Status(StatusCode.ERROR,SECRET))
        self.assertEqual(self.queue.pending,1);self.assertEqual(self.client.records,[])
        self.assertEqual(self.exporter.metrics['skipped_child'],1);self.assertEqual(self.exporter.metrics['skipped_scope'],1)
        self.queue.flush();self.assertNotIn(SECRET,json.dumps(self.client.records));self.assertEqual(self.client.records[0]['status'],'completed')
        first=self.client.records[0];self.exporter.export([span]);self.queue.flush();self.assertEqual(self.client.records[-1],first)
    def test_unset_status_failure_and_queue_capacity_are_visible(self):
        tracer=self.provider.get_tracer('approved-tracer')
        with tracer.start_as_current_span(SECRET): pass
        self.assertEqual(self.queue.pending,0);self.assertEqual(self.exporter.metrics['missing_status'],1)
        for _ in range(3):
            with tracer.start_as_current_span(SECRET) as span: span.set_status(Status(StatusCode.ERROR,SECRET))
        self.assertEqual(self.queue.pending,2);self.assertEqual(self.exporter.metrics['failed'],1)
        self.queue.flush();self.assertTrue(all(r['status']=='failed' for r in self.client.records));self.assertNotIn(SECRET,json.dumps(self.client.records))
        self.exporter.shutdown();self.assertFalse(self.exporter.force_flush());self.assertEqual(self.exporter.export([span]),SpanExportResult.FAILURE)
    def test_actual_batch_processor_flush_persists_before_explicit_delivery(self):
        provider=TracerProvider();provider.add_span_processor(BatchSpanProcessor(self.exporter,max_queue_size=8,max_export_batch_size=4,schedule_delay_millis=60000))
        try:
            with provider.get_tracer('approved-tracer').start_as_current_span(SECRET) as span: span.set_status(Status(StatusCode.OK))
            self.assertTrue(provider.force_flush());self.assertEqual(self.queue.pending,1);self.assertEqual(self.client.records,[])
            self.queue.flush();self.assertEqual(len(self.client.records),1)
        finally: provider.shutdown()

if __name__=='__main__': unittest.main()
