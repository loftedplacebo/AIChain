#!/usr/bin/env python3
"""Bounded, restart-safe two-project Stage C receipt workload (run per project)."""
import argparse
import base64
import json
import os
import pathlib
import sys
import time
from datetime import datetime, timezone

sdk_root = pathlib.Path(__file__).resolve().parents[1] / 'sdk' / 'python'
if not (sdk_root / 'orvessian_ingest.py').is_file():
    sdk_root = pathlib.Path('/opt/aichain/orvessian-chain-watch')
sys.path.insert(0, str(sdk_root))
from orvessian_ingest import Client, IngestionError

AGENT = 'stage-c-capacity-smoke'
STREAM = 'stage-c-capacity-smoke'


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def save(path, state):
    temp = path.with_name(path.name + '.tmp')
    descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(state, handle, separators=(',', ':'))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def load(path, run_id, count):
    if path.is_symlink():
        raise ValueError('State path cannot be a symbolic link')
    if path.exists():
        if os.name == 'posix' and path.stat().st_mode & 0o077:
            raise ValueError('State path must be owner-only')
        state = json.loads(path.read_text(encoding='utf-8'))
        if state.get('runId') != run_id or state.get('count') != count:
            raise ValueError('Existing run parameters differ')
        if not 0 <= state.get('accepted', -1) <= count:
            raise ValueError('Existing run state is invalid')
        return state
    state = {'runId': run_id, 'count': count, 'accepted': 0,
             'nextAt': time.time(), 'pendingAt': None}
    save(path, state)
    return state


def client():
    token = base64.b64decode(os.environ['ORVESSIAN_TOKEN_B64'], validate=True).decode('ascii')
    origin = os.environ.get('ORVESSIAN_API_URL', 'https://api.orvessian.com')
    if origin != 'https://api.orvessian.com':
        raise ValueError('Unexpected API origin')
    return Client(origin, token, os.environ['ORVESSIAN_TENANT'],
                  os.environ['ORVESSIAN_PROJECT'], timeout=10, attempts=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--state', required=True, type=pathlib.Path)
    parser.add_argument('--count', type=int, default=10)
    parser.add_argument('--interval-seconds', type=int, default=360)
    args = parser.parse_args()
    if not args.run_id.replace('-', '').isalnum() or not 1 <= len(args.run_id) <= 40:
        parser.error('Use a short opaque run ID')
    if not 1 <= args.count <= 10 or not 60 <= args.interval_seconds <= 3600:
        parser.error('Bound the run to 1–10 records at intervals of 60–3600 seconds')
    if not args.state.is_absolute() or not args.state.parent.is_dir():
        parser.error('Use an existing absolute state directory')
    state = load(args.state, args.run_id, args.count)
    api = client()
    deployment = 'load-' + args.run_id
    registration = api.register_agent(agent_ref=AGENT, environment='test',
                                      deployment_ref=deployment,
                                      owner_ref='orvessian-operator',
                                      purpose='Bounded synthetic Stage C pilot capacity check',
                                      model_ref='synthetic', config_version='v1',
                                      heartbeat_ttl_seconds=3600)
    if registration.get('status') not in ('registered', 'duplicate'):
        raise RuntimeError('Agent registration failed')
    while state['accepted'] < args.count:
        remaining = state['nextAt'] - time.time()
        if remaining > 0:
            time.sleep(min(remaining, 30))
            continue
        index = state['accepted']
        if state['pendingAt'] is None:
            state['pendingAt'] = timestamp()
            save(args.state, state)
        event_id = f'stagec-{args.run_id}-{index:02d}'
        try:
            result = api.record_run(event_id=event_id, stream_ref=STREAM,
                                    sequence=index, run_ref=event_id,
                                    agent_ref=AGENT, environment='test',
                                    deployment_ref=deployment,
                                    provider_ref='internal', model_ref='synthetic',
                                    config_version='v1', task_class='capacity-smoke',
                                    case_ref=f'sample-{index:02d}', status='completed',
                                    occurred_at=state['pendingAt'], latency_ms=0,
                                    predicted_label='synthetic',
                                    decision_code='test-only',
                                    integration_version='python-stage-c-capacity-v1')
        except IngestionError as error:
            print(json.dumps({'event': 'submission-failed', 'index': index,
                              'httpStatus': error.status}), flush=True)
            return 2
        if result.get('status') not in ('accepted', 'duplicate'):
            raise RuntimeError('Unexpected submission result')
        state['accepted'] += 1
        state['pendingAt'] = None
        state['nextAt'] = time.time() + args.interval_seconds
        save(args.state, state)
        print(json.dumps({'event': 'accepted', 'eventId': event_id,
                          'count': state['accepted'], 'project': api.project}), flush=True)
    print(json.dumps({'event': 'complete', 'count': state['accepted'],
                      'project': api.project}), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
