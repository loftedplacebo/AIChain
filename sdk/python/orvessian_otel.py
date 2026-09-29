"""Optional OpenTelemetry exporter: selected root-span metadata to local queue.

Never serializes a ReadableSpan, attributes, resource, name, events or links.
Export success means durable local acceptance, not API delivery or anchoring.
"""
import hashlib
import json
import threading
from datetime import datetime, timezone
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import StatusCode
from orvessian_ingest import _ref, _environment

VERSION = 'otel-python-1.45.0-alpha'

class GovernanceSpanExporter(SpanExporter):
    def __init__(self, queue, *, instrumentation_scope, agent_ref, environment,
                 deployment_ref, provider_ref, model_ref, config_version, task_class):
        self._queue = queue
        self._scope = _ref(instrumentation_scope)
        self._identity = dict(agent_ref=_ref(agent_ref), environment=_environment(environment),
                              deployment_ref=_ref(deployment_ref), provider_ref=_ref(provider_ref),
                              model_ref=_ref(model_ref), config_version=_ref(config_version),
                              task_class=_ref(task_class))
        self._lock = threading.Lock()
        self._closed = False
        self._last_event_id = None
        self._metrics = dict(seen=0, queued=0, skipped_scope=0, skipped_child=0,
                             missing_status=0, failed=0)

    @property
    def metrics(self):
        with self._lock: return dict(self._metrics)

    @property
    def last_event_id(self):
        """Most recently queued identity for diagnostics; not an event inventory."""
        with self._lock: return self._last_event_id

    def export(self, spans):
        with self._lock:
            if self._closed: return SpanExportResult.FAILURE
            if not isinstance(spans, (list, tuple)) or len(spans) > 512:
                self._metrics['failed'] += 1
                return SpanExportResult.FAILURE
            failed = False
            for span in spans:
                self._metrics['seen'] += 1
                try:
                    if span.instrumentation_scope.name != self._scope:
                        self._metrics['skipped_scope'] += 1
                        continue
                    if span.parent is not None:
                        self._metrics['skipped_child'] += 1
                        continue
                    code = span.status.status_code
                    if code not in (StatusCode.OK, StatusCode.ERROR):
                        self._metrics['missing_status'] += 1
                        # Do not infer successful model work from UNSET.
                        failed = True
                        continue
                    context = span.context
                    if context is None or not context.is_valid:
                        raise ValueError('Invalid span context')
                    start, end = span.start_time, span.end_time
                    if type(start) is not int or type(end) is not int or start < 0 or end < start or end-start > 86400000000000:
                        raise ValueError('Invalid span timing')
                    identity = [self._queue.client.tenant, self._queue.client.project,
                                self._identity['environment'], format(context.trace_id,'032x'),
                                format(context.span_id,'016x')]
                    event_id = 'otel-'+hashlib.sha256(json.dumps(identity,separators=(',',':')).encode()).hexdigest()
                    timestamp = datetime.fromtimestamp(start//1000000000, timezone.utc).replace(microsecond=(start//1000)%1000000)
                    record = dict(self._identity, event_id=event_id, stream_ref=event_id,
                                  sequence=0, run_ref='trace-'+format(context.trace_id,'032x'),
                                  occurred_at=timestamp.isoformat(timespec='milliseconds').replace('+00:00','Z'),
                                  latency_ms=(end-start)//1000000,
                                  status='failed' if code == StatusCode.ERROR else 'completed',
                                  integration_version=VERSION)
                    self._queue._enqueue(record)
                    self._last_event_id = event_id
                    self._metrics['queued'] += 1
                except Exception:
                    # Do not retain exception text or raw spans after failure.
                    self._metrics['failed'] += 1
                    failed = True
            return SpanExportResult.FAILURE if failed else SpanExportResult.SUCCESS

    def force_flush(self, timeout_millis=30000):
        # No exporter-owned buffer or network work. SDK processors flush their
        # spans into this durable queue; API delivery remains explicit.
        if type(timeout_millis) is not int or timeout_millis < 0:
            return False
        if not self._lock.acquire(timeout=min(timeout_millis,60000)/1000):
            return False
        try: return not self._closed
        finally: self._lock.release()

    def shutdown(self):
        with self._lock: self._closed = True
        # Queue ownership stays with the customer; shutdown must not discard it.
