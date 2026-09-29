"""Framework-neutral queue binding/recovery tests; no optional dependencies."""
import os
import tempfile
import unittest
from orvessian_delivery import DeliveryQueue
from orvessian_ingest import Client

class RecordingClient:
    base_url = 'http://127.0.0.1'
    tenant = 'tenant'
    project = 'project'
    def __init__(self): self.sent = []
    def record_run(self, **record):
        self.sent.append(record)
        return dict(eventId=record['event_id'], status='accepted')

class DeliveryBindingTests(unittest.TestCase):
    def test_standard_client_and_queue_public_scope_are_read_only(self):
        client = Client('http://127.0.0.1', 'x'*32, 'tenant', 'project')
        for attribute in ('base_url', 'tenant', 'project', 'timeout', 'attempts'):
            with self.assertRaises(AttributeError): setattr(client, attribute, 'foreign')
        for timeout in (True, '10', float('nan'), float('inf'), 0, 61):
            with self.assertRaises(ValueError): Client('http://127.0.0.1', 'x'*32, 'tenant', 'project', timeout=timeout)
        with tempfile.TemporaryDirectory() as directory:
            queue = DeliveryQueue(os.path.join(directory, 'queue.sqlite'), client)
            try:
                for attribute in ('client', 'capacity'):
                    with self.assertRaises(AttributeError): setattr(queue, attribute, None)
            finally: queue.close()

    def test_mutable_custom_client_scope_cannot_redirect_persisted_records(self):
        for attribute in ('base_url', 'tenant', 'project'):
            with self.subTest(attribute=attribute), tempfile.TemporaryDirectory() as directory:
                client = RecordingClient()
                queue = DeliveryQueue(os.path.join(directory, 'queue.sqlite'), client)
                try:
                    queue._enqueue(dict(event_id='event-1', status='failed'))
                    original = getattr(client, attribute)
                    setattr(client, attribute, 'foreign')
                    with self.assertRaisesRegex(ValueError, 'scope changed'): queue.flush()
                    with self.assertRaisesRegex(ValueError, 'scope changed'): queue._enqueue(dict(event_id='event-2'))
                    self.assertEqual(queue.pending, 1)
                    self.assertEqual(client.sent, [])
                    setattr(client, attribute, original)
                    self.assertEqual(queue.flush(), 1)
                    self.assertEqual(client.sent, [dict(event_id='event-1', status='failed')])
                finally: queue.close()

    def test_scope_rechecked_between_records_and_memory_queues_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Persistent'): DeliveryQueue(':memory:', RecordingClient())
        with tempfile.TemporaryDirectory() as directory:
            client = RecordingClient()
            queue = DeliveryQueue(os.path.join(directory, 'queue.sqlite'), client)
            try:
                for index in range(2): queue._enqueue(dict(event_id='event-'+str(index)))
                def send(**record):
                    client.sent.append(record)
                    client.project = 'foreign'
                    return dict(eventId=record['event_id'], status='accepted')
                client.record_run = send
                with self.assertRaisesRegex(ValueError, 'scope changed'): queue.flush()
                self.assertEqual(len(client.sent), 1)
                self.assertEqual(queue.pending, 1)
            finally: queue.close()
