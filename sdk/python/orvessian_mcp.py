"""Customer-side MCP call wrapper; arguments and results are never captured.

Attach to an existing root GovernanceCallback. Does not open connections, discover
tools, grant permissions or create extra model-run records.
"""
from uuid import uuid4
import asyncio
from threading import Lock
from orvessian_ingest import _ref

class GovernanceMcpClient:
    def __init__(self, client, observer, *, tool_catalog):
        if not isinstance(tool_catalog,dict) or len(tool_catalog)>100:
            raise ValueError('Provide up to 100 configured tool mappings')
        self._catalog={}
        for name,definition in tool_catalog.items():
            _ref(name)
            if not isinstance(definition,dict) or set(definition)!={'toolRef','version'}:
                raise ValueError('Tool mapping needs toolRef and version')
            self._catalog[name]={key:_ref(definition[key]) for key in ('toolRef','version')}
        self._client,self._observer=client,observer
        self._lock=Lock()
        self._metrics=dict(calls=0,skipped_unmapped=0,capture_failed=0,pending=0)

    @property
    def metrics(self):
        with self._lock: return dict(self._metrics)

    def _count(self,key):
        with self._lock: self._metrics[key]+=1

    async def call_tool(self,name,arguments=None,**kwargs):
        self._count('calls');definition=self._catalog.get(name);call_id=uuid4();captured=False
        if definition is None: self._count('skipped_unmapped')
        else:
            try: captured=self._observer.start_external_tool(call_id=call_id,tool_ref=definition['toolRef'],version=definition['version'])
            except Exception: captured=False
            if not captured: self._count('capture_failed')
        def finish(code):
            if captured:
                try: updated=self._observer.finish_external_tool(call_id=call_id,result_code=code)
                except Exception: updated=False
                if not updated: self._count('capture_failed')
        try:
            # Forward the original call without inspecting or persisting payloads.
            result=await self._client.call_tool(name,arguments,**kwargs)
        except asyncio.CancelledError:
            finish('interrupted')
            raise
        except Exception:
            finish('failed')
            raise
        # Read only protocol status. Unknown/nonterminal results stay pending;
        # content, structured content, metadata and error text are not inspected.
        is_error=getattr(result,'is_error',None)
        if type(is_error) is bool: finish('failed' if is_error else 'completed')
        elif type(getattr(result,'isError',None)) is bool:
            finish('failed' if result.isError else 'completed')
        else: self._count('pending')
        return result
