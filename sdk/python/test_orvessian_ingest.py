import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from orvessian_ingest import Client, IngestionError

class ClientTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.responses = [200]
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                owner.requests.append(self.rfile.read(int(self.headers['Content-Length'])))
                self.send_response(owner.responses.pop(0))
                self.send_header('Location', '/redirected')
                self.end_headers()
                self.wfile.write(json.dumps({'status':'accepted','eventId':json.loads(owner.requests[-1]).get('eventId')}).encode())
            def log_message(self, *args):
                pass
        self.server = HTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.client = Client('http://127.0.0.1:'+str(self.server.server_port), 'x'*32, 'tenant', 'project')

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def run_event(self, **extra):
        return self.client.record_run(event_id='evt-1', stream_ref='stream-1', sequence=1, run_ref='run-1', agent_ref='agent-1', environment='test', deployment_ref='v1', provider_ref='synthetic', model_ref='model-1', config_version='v1', task_class='classify', status='completed', **extra)

    def test_acknowledgement_must_match_event(self):
        for result in (None, {}, {'status':'accepted','eventId':'other'}, {'status':'queued','eventId':'evt-1'}):
            self.client._request = lambda *args, result=result: result
            with self.assertRaises(IngestionError): self.run_event()

    def test_retry_preserves_event_identity_and_bytes(self):
        self.responses = [503, 200]
        self.run_event()
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(self.requests[0], self.requests[1])
        body = json.loads(self.requests[0])
        self.assertEqual(body['eventId'], 'evt-1')
        self.assertNotIn('prompt', body)

    def test_conflict_and_redirect_do_not_retry_or_leak(self):
        for status in (409, 302):
            self.responses = [status]
            with self.assertRaises(IngestionError) as error:
                self.run_event()
            self.assertEqual(error.exception.status, status)
            self.assertNotIn('x'*32, str(error.exception))
        self.assertEqual(len(self.requests), 2)

    def test_source_fields_and_invalid_sequence_rejected_before_transport(self):
        with self.assertRaises(TypeError):
            self.run_event(prompt='private')
        with self.assertRaises(ValueError):
            self.client.heartbeat(agent_ref='a', environment='test', deployment_ref='v1', sequence=True)
        self.assertEqual(self.requests, [])

    def test_tool_metadata_allowlist_and_bounds(self):
        for observations in ([{'toolRef':'t','version':'v1','resultCode':'completed','arguments':'private'}],
                             [{'toolRef':'t','version':'v1','resultCode':'completed','allowed':'true'}],
                             [{'toolRef':'t','version':'v1','resultCode':'completed'}]*101):
            with self.assertRaises(ValueError): self.run_event(tool_calls=observations)
        self.assertEqual(self.requests, [])
        self.run_event(tool_calls=[{'toolRef':'t','version':'v1','resultCode':'completed'}])
        self.assertEqual(json.loads(self.requests[-1])['activity']['toolCalls'][0]['toolRef'],'t')

    def test_remote_http_and_embedded_credentials_rejected(self):
        for url in ('http://example.com', 'https://user:secret@example.com', 'https://example.com/path'):
            with self.assertRaises(ValueError):
                Client(url, 'x'*32, 'tenant', 'project')

if __name__ == '__main__':
    unittest.main()
