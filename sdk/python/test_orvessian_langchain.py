import asyncio
import json
import os
import tempfile
import unittest
from uuid import uuid4
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor

# Disable third-party tracing for this synthetic acceptance suite.
os.environ['LANGSMITH_TRACING'] = 'false'
os.environ['LANGCHAIN_TRACING_V2'] = 'false'
from langchain_core.runnables import RunnableLambda
from langchain_core.tools import tool
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langgraph.graph import StateGraph, START, END
from typing import TypedDict
from orvessian_langchain import GovernanceCallback, DeliveryQueue

SECRET = 'PRIVATE-PROMPT-OUTPUT-TOKEN-DO-NOT-CAPTURE'
IDENTITY = dict(agent_ref='framework-agent', environment='test', deployment_ref='v1',
                provider_ref='synthetic', model_ref='synthetic-model', config_version='v1', task_class='workflow-invocation')

class FakeClient:
    base_url = 'http://127.0.0.1:8799'
    tenant = 'tenant'
    project = 'project'
    def __init__(self):
        self.records = []
        self.fail = False
    def record_run(self, **record):
        self.records.append(record)
        if self.fail:
            raise OSError('unavailable')
        return {'status':'accepted', 'eventId':record['event_id']}

class State(TypedDict):
    text: str

def graph():
    builder = StateGraph(State)
    builder.add_node('classify', lambda state: {'text': SECRET})
    builder.add_edge(START, 'classify')
    builder.add_edge('classify', END)
    return builder.compile()

class FrameworkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp.name, 'pending.sqlite')
        self.client = FakeClient()
        self.queue = DeliveryQueue(self.path, self.client, capacity=4)
    def tearDown(self):
        self.queue.close()
        self.temp.cleanup()
    def handler(self):
        return GovernanceCallback(self.queue, run_id=uuid4(), **IDENTITY)
    def config(self, handler):
        return {'callbacks':[handler], 'run_id':handler.run_id, 'metadata':{'secret':SECRET}, 'tags':[SECRET]}
    def test_real_langchain_nested_pipeline_capture_boundary(self):
        h = self.handler()
        chain = RunnableLambda(lambda value: {'nested':value}) | RunnableLambda(lambda value: SECRET)
        self.assertEqual(chain.invoke(SECRET, self.config(h)), SECRET)
        self.assertEqual(h.capture_status, 'queued')
        self.assertEqual(self.queue.pending, 1)
        self.assertEqual(self.client.records, [])
        self.queue.flush()
        self.assertEqual(len(self.client.records), 1)
        self.assertNotIn(SECRET, json.dumps(self.client.records))
        self.assertEqual(self.client.records[0]['run_ref'], str(h.run_id))
    def test_real_graph_sync_async_and_stream(self):
        g = graph()
        h1, h2, h3 = self.handler(), self.handler(), self.handler()
        g.invoke({'text':SECRET}, self.config(h1))
        asyncio.run(g.ainvoke({'text':SECRET}, self.config(h2)))
        list(g.stream({'text':SECRET}, self.config(h3)))
        self.assertEqual([h.capture_status for h in (h1,h2,h3)], ['queued']*3)
        self.queue.flush()
        self.assertEqual(len(self.client.records), 3)
        self.assertNotIn(SECRET, json.dumps(self.client.records))
    def test_exception_text_is_not_captured(self):
        def fail(value):
            raise ValueError(SECRET)
        h = self.handler()
        with self.assertRaises(ValueError):
            RunnableLambda(fail).invoke(SECRET, self.config(h))
        self.queue.flush()
        self.assertEqual(self.client.records[0]['status'], 'failed')
        self.assertNotIn(SECRET, json.dumps(self.client.records))
    def test_actual_chat_model_stream_excludes_prompts_tokens_and_output(self):
        h = self.handler()
        chain = RunnableLambda(lambda value: value) | FakeListChatModel(responses=[SECRET])
        list(chain.stream(SECRET, self.config(h)))
        self.queue.flush()
        self.assertEqual(len(self.client.records), 1)
        self.assertNotIn(SECRET, json.dumps(self.client.records))
    def test_async_graph_stream_records_one_root(self):
        h = self.handler()
        async def consume():
            async for _ in graph().astream({'text':SECRET}, self.config(h)):
                pass
        asyncio.run(consume())
        self.assertEqual(h.capture_status, 'queued')
        self.assertEqual(self.queue.pending, 1)
    def test_no_completion_signal_does_not_invent_an_event(self):
        h = self.handler()
        h.on_chain_start(None, SECRET, run_id=h.run_id)
        h.on_chain_end(SECRET, run_id=uuid4(), parent_run_id=h.run_id)
        self.assertEqual(h.capture_status, 'running')
        self.assertEqual(self.queue.pending, 0)
    def test_uncertain_delivery_survives_restart_with_identical_record(self):
        h = self.handler()
        graph().invoke({'text':SECRET}, self.config(h))
        self.client.fail = True
        with self.assertRaises(OSError): self.queue.flush()
        first = self.client.records[-1]
        self.queue.close()
        self.queue = DeliveryQueue(self.path, self.client)
        self.client.fail = False
        self.assertEqual(self.queue.flush(), 1)
        self.assertEqual(self.client.records[-1], first)
        self.assertEqual(self.queue.pending, 0)
    def test_scope_binding_and_capacity_failure_are_visible(self):
        other = FakeClient()
        other.tenant = 'foreign'
        with self.assertRaises(ValueError): DeliveryQueue(self.path, other)
        for _ in range(4):
            h = self.handler()
            graph().invoke({'text':SECRET}, self.config(h))
        h = self.handler()
        graph().invoke({'text':SECRET}, self.config(h))
        self.assertEqual(h.capture_status, 'capture-failed')
        self.assertEqual(self.queue.pending, 4)
    def test_concurrent_roots_and_duplicate_callback(self):
        handlers = [self.handler() for _ in range(4)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda h: graph().invoke({'text':SECRET}, self.config(h)), handlers))
        h = handlers[0]
        h.on_chain_end(SECRET, run_id=h.run_id)
        self.assertEqual(self.queue.pending, 4)
        self.queue.flush()
        self.assertEqual(len({r['event_id'] for r in self.client.records}), 4)
    def test_unknown_acknowledgement_retains_record(self):
        h = self.handler()
        graph().invoke({'text':SECRET}, self.config(h))
        with patch.object(self.client, 'record_run', return_value={'status':'unexpected'}):
            with self.assertRaises(RuntimeError): self.queue.flush()
        self.assertEqual(self.queue.pending, 1)

    def test_real_tool_sync_async_and_error_capture_excludes_payloads(self):
        @tool
        def lookup(text: str) -> str:
            """Synthetic private tool description."""
            if text == 'fail': raise ValueError(SECRET)
            return SECRET
        for asynchronous, fail in ((False,False),(True,False),(False,True)):
            h = GovernanceCallback(self.queue, run_id=uuid4(), tool_catalog={'lookup':{'toolRef':'case-lookup','version':'v2'}}, **IDENTITY)
            chain = RunnableLambda(lambda value, config: lookup.invoke(value, config))
            if fail:
                with self.assertRaises(ValueError): chain.invoke('fail', self.config(h))
            elif asynchronous: asyncio.run(chain.ainvoke(SECRET, self.config(h)))
            else: chain.invoke(SECRET, self.config(h))
            self.assertEqual(h.capture_status, 'queued')
            self.queue.flush()
            self.assertEqual(self.client.records[-1]['tool_calls'], [{'toolRef':'case-lookup','version':'v2','resultCode':'failed' if fail else 'completed'}])
            self.assertNotIn(SECRET, json.dumps(self.client.records))

    def test_tool_unknown_foreign_duplicate_pending_and_limit_are_visible(self):
        h = GovernanceCallback(self.queue, run_id=uuid4(), tool_catalog={'lookup':{'toolRef':'case-lookup','version':'v2'}}, **IDENTITY)
        h.on_chain_start(None, SECRET, run_id=h.run_id)
        h.on_tool_start({'name':'lookup'},SECRET,run_id=uuid4(),parent_run_id=uuid4())
        h.on_tool_start({'name':SECRET},SECRET,run_id=uuid4(),parent_run_id=h.run_id)
        self.assertEqual(h.tool_capture_status,'unmapped')
        for _ in range(101):
            tool_id=uuid4()
            h.on_tool_start({'name':'lookup','description':SECRET},SECRET,run_id=tool_id,parent_run_id=h.run_id)
            h.on_tool_start({'name':'lookup'},SECRET,run_id=tool_id,parent_run_id=h.run_id)
        self.assertEqual(h.tool_capture_status,'limited')
        h.on_chain_end(SECRET,run_id=h.run_id)
        self.queue.flush()
        observations=self.client.records[-1]['tool_calls']
        self.assertEqual(len(observations),100)
        self.assertTrue(all(c['resultCode']=='pending' for c in observations))
        self.assertNotIn(SECRET,json.dumps(self.client.records))

if __name__ == '__main__':
    unittest.main()
