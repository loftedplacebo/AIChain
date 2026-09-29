"""Optional LangChain/LangGraph root-invocation adapter. Never stores callback payloads."""
import threading
import time
from datetime import datetime, timezone
from uuid import UUID
from langchain_core.callbacks import BaseCallbackHandler
from orvessian_ingest import _ref, _environment

ADAPTER_VERSION = 'langchain-python-0.1.0-alpha'

from orvessian_delivery import DeliveryQueue

class GovernanceCallback(BaseCallbackHandler):
    """A fresh handler for one explicitly identified root invocation.

    Pass config={"callbacks": [handler], "run_id": handler.run_id}. Child runs,
    tags, metadata, inputs, outputs and errors are ignored. Opt-in tool capture
    reads only serialized.name to look up a customer-defined opaque reference.
    Check capture_status after invocation. Capture failures do not stop the agent.
    Network delivery is explicit via DeliveryQueue.flush().
    """
    raise_error = False
    run_inline = True

    def __init__(self, queue, *, run_id, agent_ref, environment, deployment_ref,
                 provider_ref, model_ref, config_version, task_class, case_ref=None, decision_labels=(), tool_catalog=None):
        self.run_id = UUID(str(run_id))
        self._queue = queue
        self._identity = dict(agent_ref=_ref(agent_ref), environment=_environment(environment),
                              deployment_ref=_ref(deployment_ref), provider_ref=_ref(provider_ref),
                              model_ref=_ref(model_ref), config_version=_ref(config_version),
                              task_class=_ref(task_class))
        self._lock = threading.Lock()
        self._start = None
        if tool_catalog is None: tool_catalog = {}
        if not isinstance(tool_catalog, dict) or len(tool_catalog) > 100:
            raise ValueError('Provide up to 100 fixed tool mappings')
        self._tool_catalog = {}
        for name, definition in tool_catalog.items():
            _ref(name)
            if not isinstance(definition, dict) or set(definition) != {'toolRef','version'}:
                raise ValueError('Tool mapping requires only toolRef and version')
            self._tool_catalog[name] = {key:_ref(definition[key]) for key in ('toolRef','version')}
        self._descendants = {self.run_id}
        self._tools = {}
        self.tool_capture_status = 'enabled' if self._tool_catalog else 'disabled'
        if not isinstance(decision_labels, (tuple,list)) or len(decision_labels)>32:
            raise ValueError('Provide up to 32 fixed decision labels')
        self._decision_labels = frozenset(_ref(v) for v in decision_labels)
        if self._decision_labels and case_ref is None: raise ValueError('Decision capture requires a case reference')
        if case_ref is not None: self._identity['case_ref'] = _ref(case_ref)
        self._decision = None
        self.capture_status = 'not-started'

    def set_decision(self, label):
        """Explicit customer-side mapping, never automatic output extraction."""
        if not isinstance(label,str) or label not in self._decision_labels:
            raise ValueError('Decision is outside the configured vocabulary')
        with self._lock:
            if self.capture_status != 'running' or self._decision is not None:
                raise ValueError('Set one decision during the root invocation')
            self._decision = label

    def on_chain_start(self, serialized, inputs, *, run_id, parent_run_id=None, **kwargs):
        with self._lock:
            if run_id == self.run_id and parent_run_id is None and self.capture_status == 'not-started':
                self._start = time.monotonic()
                self.capture_status = 'running'
            elif self.capture_status == 'running' and self._tool_catalog and parent_run_id in self._descendants:
                if len(self._descendants) < 1000: self._descendants.add(run_id)
                else: self.tool_capture_status = 'limited'

    def on_tool_start(self, serialized, input_str, *, run_id, parent_run_id=None, **kwargs):
        with self._lock:
            if not self._tool_catalog or self.capture_status != 'running' or parent_run_id not in self._descendants or run_id in self._tools:
                return
            # Never inspect input_str, inputs, kwargs, descriptions or tool schema.
            name = serialized.get('name') if isinstance(serialized, dict) else None
            definition = self._tool_catalog.get(name) if isinstance(name, str) else None
            if definition is None:
                if self.tool_capture_status != 'limited': self.tool_capture_status = 'unmapped'
                return
            if len(self._tools) >= 100:
                self.tool_capture_status = 'limited'
                return
            self._tools[run_id] = dict(definition, resultCode='pending')

    def _finish_tool(self, run_id, result_code):
        with self._lock:
            if self.capture_status == 'running' and run_id in self._tools and self._tools[run_id]['resultCode'] == 'pending':
                self._tools[run_id]['resultCode'] = result_code
                return True
            return False

    def start_external_tool(self, *, call_id, tool_ref, version):
        """Metadata-only observation for a customer-invoked external tool.

        Does not call a tool, authorize it, or accept its arguments/results.
        """
        call_id = UUID(str(call_id));definition=dict(toolRef=_ref(tool_ref),version=_ref(version),resultCode='pending')
        with self._lock:
            if self.capture_status != 'running' or call_id in self._tools: return False
            if len(self._tools) >= 100:
                self.tool_capture_status = 'limited'
                return False
            if self.tool_capture_status == 'disabled': self.tool_capture_status = 'enabled'
            self._tools[call_id] = definition
            return True

    def finish_external_tool(self, *, call_id, result_code):
        if result_code not in ('completed','failed','interrupted'): raise ValueError('Invalid external tool status')
        return self._finish_tool(UUID(str(call_id)),result_code)

    def on_tool_end(self, output, *, run_id, **kwargs):
        self._finish_tool(run_id, 'completed')

    def on_tool_error(self, error, *, run_id, **kwargs):
        self._finish_tool(run_id, 'failed')

    def _finish(self, run_id, parent_run_id, status):
        if run_id != self.run_id or parent_run_id is not None:
            return
        with self._lock:
            if self.capture_status != 'running':
                return
            record = dict(self._identity, event_id='lc-'+str(self.run_id),
                          stream_ref='lc-'+str(self.run_id), sequence=0, run_ref=str(self.run_id),
                          occurred_at=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                          status=status, latency_ms=min(86400000, max(0, int((time.monotonic()-self._start)*1000))),
                          integration_version=ADAPTER_VERSION)
            if status == 'completed' and self._decision is not None:
                record.update(predicted_label=self._decision, decision_code=self._decision)
            if self._tools:
                record['tool_calls'] = [dict(call) for call in self._tools.values()]
            try:
                self._queue._enqueue(record)
                self.capture_status = 'queued'
            except Exception:
                # No exception text: it could contain filesystem or customer data.
                self.capture_status = 'capture-failed'

    def on_chain_end(self, outputs, *, run_id, parent_run_id=None, **kwargs):
        self._finish(run_id, parent_run_id, 'completed')

    def on_chain_error(self, error, *, run_id, parent_run_id=None, **kwargs):
        self._finish(run_id, parent_run_id, 'failed')

    # Explicitly ignore chat payloads; BaseCallbackHandler otherwise raises
    # NotImplementedError to trigger a chat-to-prompt fallback in some managers.
    def on_chat_model_start(self, serialized, messages, **kwargs):
        pass
