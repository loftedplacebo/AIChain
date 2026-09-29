import json
import os
import tempfile
import unittest
from uuid import uuid4
import httpx
os.environ['LANGSMITH_TRACING']='false'
os.environ['LANGCHAIN_TRACING_V2']='false'
from orvessian_ingest import Client
from orvessian_langchain import DeliveryQueue, GovernanceCallback
from orvessian_openai import create_chat_model, decision_chain

class OutcomeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.client=Client('http://127.0.0.1:8799','synthetic-token-'*4,'tenant','project')
        self.sent=[]
        self.client._request=lambda path,body: self.sent.append(body) or {'status':'accepted','eventId':body['eventId']}
        self.queue=DeliveryQueue(os.path.join(self.temp.name,'queue.sqlite'),self.client)
    def tearDown(self):
        self.queue.close()
        self.temp.cleanup()
    def handler(self):
        return GovernanceCallback(self.queue,run_id=uuid4(),agent_ref='a',environment='test',deployment_ref='v1',provider_ref='openai',model_ref='test-model',config_version='v1',task_class='classification',case_ref='case-1',decision_labels=('approve','review','reject'))
    def invoke(self,content='review',finish='stop',status=200):
        requests=[]
        def respond(request):
            requests.append(json.loads(request.content))
            if status!=200: return httpx.Response(status,json={'error':{'message':'PRIVATE-PROVIDER-ERROR','type':'server_error'}})
            return httpx.Response(200,json={'id':'chatcmpl-test','object':'chat.completion','created':1,'model':'test-model','choices':[{'index':0,'message':{'role':'assistant','content':content},'finish_reason':finish}],'usage':{'prompt_tokens':4,'completion_tokens':1,'total_tokens':5}})
        h=self.handler()
        with httpx.Client(transport=httpx.MockTransport(respond)) as http:
            model=create_chat_model(api_key='synthetic-provider-key',model='test-model',http_client=http)
            try: decision_chain(model,h).invoke('PRIVATE-SOURCE-TEXT',{'callbacks':[h],'run_id':h.run_id})
            except Exception: pass
        self.queue.flush()
        return h,requests
    def test_real_provider_sdk_transport_and_decision_allowlist(self):
        h,requests=self.invoke()
        self.assertEqual(h.capture_status,'queued')
        self.assertEqual(len(requests),1)
        self.assertFalse(requests[0]['store'])
        self.assertEqual(requests[0]['max_completion_tokens'],128)
        event=self.sent[0]
        self.assertEqual(event['result']['predictedLabel'],'review')
        self.assertEqual(event['caseRef'],'case-1')
        self.assertNotIn('PRIVATE',json.dumps(self.sent))
        self.assertNotIn('synthetic-provider-key',json.dumps(self.sent))
    def test_unknown_truncated_and_provider_error_do_not_become_predictions(self):
        for content,finish,status in [('PRIVATE-OUTPUT','stop',200),('review','length',200),('', 'stop',500)]:
            self.invoke(content,finish,status)
            self.assertEqual(self.sent[-1]['result']['status'],'failed')
            self.assertNotIn('predictedLabel',self.sent[-1]['result'])
        self.assertNotIn('PRIVATE',json.dumps(self.sent))
    def test_review_event_persists_independently_and_is_replayable(self):
        h,_=self.invoke()
        outcome=dict(event_id='review-1',for_event_id='lc-'+str(h.run_id),case_ref='case-1',environment='test',label='review',label_source='human-adjudication',evaluator_ref='reviewer-1',rubric_version='v1',occurred_at='2026-09-27T12:00:00.000Z')
        self.queue.enqueue_outcome(**outcome)
        self.queue.enqueue_outcome(**outcome)
        self.assertEqual(self.queue.pending,1)
        self.queue.flush()
        self.assertEqual(self.sent[-1]['eventType'],'ai.outcome.adjudicated')
        self.assertEqual(self.sent[-1]['outcome']['forEventId'],self.sent[0]['eventId'])
        self.assertEqual(self.sent[-1]['source']['kind'],'human-reviewer')
        with self.assertRaises(TypeError): self.queue.enqueue_outcome(**outcome,prompt='PRIVATE')
        with self.assertRaises(ValueError): self.queue.enqueue_outcome(**dict(outcome,label_source='guessed'))

if __name__=='__main__': unittest.main()
