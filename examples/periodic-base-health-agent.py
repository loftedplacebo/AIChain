"""Bounded, synthetic Base Sepolia health watcher using the Orvessian SDK.

It reads public chain status, asks the configured OpenAI model for one fixed
health label, and records only that label and run metadata. The existing hosted
Orvessian evidence worker owns receipt signing and Base Sepolia transactions.
"""
import base64
import binascii
import json
import os
import signal
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import (HTTPRedirectHandler, ProxyHandler, Request, build_opener)
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'sdk' / 'python'))
from orvessian_ingest import Client, IngestionError

MODEL = 'gpt-4.1-mini'
API_ORIGIN = 'https://api.orvessian.com'
RPC_URL = 'https://sepolia.base.org'
OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
CONTRACT = '0x5781540e4682a9d35011c94a25f615e438e8e7af'
AGENT = 'base-sepolia-health-watcher'
DEPLOYMENT = 'v1'
STREAM = 'base-sepolia-health-watch'
INTERVAL_SECONDS = 3600
WINDOW_SECONDS = 48 * 3600
MAX_MODEL_CALLS = 48
DELIVERY_RETRY_SECONDS = 300


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def emit(**fields):
    print(json.dumps(fields, separators=(',', ':')), flush=True)


def utc_timestamp(epoch=None):
    value = datetime.fromtimestamp(epoch or time.time(), timezone.utc)
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def required_env(name):
    value = os.environ.get(name, '')
    if not value or '\n' in value or '\r' in value:
        raise ValueError('Required setting is missing or invalid: ' + name)
    return value


def secret_env(name):
    try:
        return base64.b64decode(required_env(name), validate=True).decode('ascii')
    except (binascii.Error, UnicodeDecodeError):
        raise ValueError('Required secret setting is invalid: ' + name) from None


def rpc(method, params):
    body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method,
                       'params': params}, separators=(',', ':')).encode()
    request = Request(RPC_URL, data=body,
                      headers={'content-type': 'application/json',
                               'accept': 'application/json',
                               'user-agent': 'orvessian-chain-watch/1.0'})
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=8) as response:
            payload = response.read(65537)
        if len(payload) > 65536:
            raise ValueError('RPC response exceeds limit')
        result = json.loads(payload)
        if result.get('error') or 'result' not in result:
            raise ValueError('RPC result unavailable')
        return result['result']
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        raise RuntimeError('rpc-unavailable') from None


def observe_chain(previous_block):
    try:
        chain_id = int(rpc('eth_chainId', []), 16)
        block = int(rpc('eth_blockNumber', []), 16)
        code = rpc('eth_getCode', [CONTRACT, 'latest'])
        signals = {
            'expectedChain': chain_id == 84532,
            'blockAvailable': block > 0,
            'contractPresent': isinstance(code, str) and code not in ('0x', '0x0'),
            'priorBlockKnown': previous_block is not None,
            'blockAdvanced': previous_block is None or block > previous_block,
        }
        return signals, block
    except Exception:
        return {'expectedChain': False, 'blockAvailable': False,
                'contractPresent': False, 'priorBlockKnown': previous_block is not None,
                'blockAdvanced': False}, None


def classify(api_key, signals, block):
    summary = dict(signals)
    if block is not None:
        summary['latestBlock'] = block
    prompt = ('Classify this read-only Base Sepolia health observation. Return exactly '
              'healthy or degraded. healthy requires expectedChain, blockAvailable, '
              'and contractPresent to be true; when priorBlockKnown is true, '
              'blockAdvanced must also be true. On the first baseline, ignore blockAdvanced. '
              'Signals: ' + json.dumps(summary, separators=(',', ':')))
    body = json.dumps({
        'model': MODEL,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_completion_tokens': 8,
        'temperature': 0,
        'store': False,
    }, separators=(',', ':')).encode()
    request = Request(OPENAI_URL, data=body,
                      headers={'Authorization': 'Bearer ' + api_key,
                               'content-type': 'application/json'})
    try:
        with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=15) as response:
            payload = response.read(65537)
        if len(payload) > 65536:
            raise ValueError('OpenAI response exceeds limit')
        result = json.loads(payload)
        choice = result['choices'][0]
        if choice.get('finish_reason') != 'stop':
            return None
        label = choice['message']['content'].strip()
        if label not in ('healthy', 'degraded'):
            return None
        # The model cannot override a failed deterministic safety check.
        hard_checks = signals['expectedChain'] and signals['blockAvailable'] and signals['contractPresent']
        if signals['priorBlockKnown']:
            hard_checks = hard_checks and signals['blockAdvanced']
        return label if label == 'degraded' or hard_checks else 'degraded'
    except (HTTPError, URLError, TimeoutError, OSError, ValueError,
            KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.chain-watch-', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(state, stream, sort_keys=True, separators=(',', ':'))
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load_state(path):
    if not path.exists():
        now = time.time()
        state = {'version': 1, 'startedAt': now, 'expiresAt': now + WINDOW_SECONDS,
                 'nextSlot': 0, 'attempts': 0, 'accepted': 0, 'sequence': 0,
                 'heartbeatSequence': 0, 'lastBlock': None, 'pending': None,
                 'retryAt': 0}
        save_state(path, state)
        return state
    if path.is_symlink():
        raise ValueError('State path may not be a symbolic link')
    if os.name == 'posix' and path.stat().st_mode & 0o077:
        raise ValueError('State file permissions must be owner-only')
    state = json.loads(path.read_text(encoding='utf-8'))
    required = {'version', 'startedAt', 'expiresAt', 'nextSlot', 'attempts',
                'accepted', 'sequence', 'heartbeatSequence', 'lastBlock',
                'pending', 'retryAt'}
    if not isinstance(state, dict) or set(state) != required or state['version'] != 1:
        raise ValueError('State file is invalid; refusing to reset the run window')
    if state['expiresAt'] != state['startedAt'] + WINDOW_SECONDS:
        raise ValueError('State run window changed; refusing to continue')
    if not 0 <= state['attempts'] <= MAX_MODEL_CALLS or not 0 <= state['sequence'] <= MAX_MODEL_CALLS:
        raise ValueError('State run limit is invalid')
    return state


def finalize_pending(path, state):
    pending = state['pending']
    state['sequence'] = pending['record']['sequence'] + 1
    state['accepted'] += 1
    if isinstance(pending.get('block'), int):
        state['lastBlock'] = pending['block']
    state['pending'] = None
    state['retryAt'] = 0
    save_state(path, state)
    emit(event='recorded', eventId=pending['record']['event_id'],
         decision=pending['record'].get('predicted_label'),
         status=pending['record']['status'], accepted=state['accepted'])


def send_pending(client, path, state):
    pending = state['pending']
    try:
        result = client.record_run(**pending['record'])
        if result.get('status') not in ('accepted', 'duplicate'):
            raise IngestionError()
        finalize_pending(path, state)
        return True
    except IngestionError as error:
        state['retryAt'] = time.time() + DELIVERY_RETRY_SECONDS
        save_state(path, state)
        emit(event='delivery-deferred', httpStatus=error.status,
             retrySeconds=DELIVERY_RETRY_SECONDS)
        return False


def make_client():
    url = required_env('ORVESSIAN_API_URL')
    if url != API_ORIGIN:
        raise ValueError('Unexpected Orvessian API origin')
    return Client(url, secret_env('ORVESSIAN_TOKEN_B64'),
                  required_env('ORVESSIAN_TENANT'),
                  required_env('ORVESSIAN_PROJECT'), timeout=10, attempts=1)


def main(once=False):
    state_path = Path(os.environ.get('AGENT_STATE_FILE',
                        '/var/lib/orvessian-chain-watch/state.json'))
    state = load_state(state_path)
    if once and state['accepted'] >= 1 and state['pending'] is None:
        emit(event='one-shot-complete', accepted=state['accepted'])
        return 0
    api_key = secret_env('OPENAI_API_KEY_B64')
    model = os.environ.get('OPENAI_MODEL', MODEL)
    if model != MODEL:
        raise ValueError('Unexpected model configuration')
    client = make_client()
    stop = False

    def request_stop(_signum, _frame):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    client.register_agent(agent_ref=AGENT, environment='test',
                          deployment_ref=DEPLOYMENT,
                          owner_ref='orvessian-demo',
                          purpose='Classify read-only Base Sepolia health signals',
                          model_ref=MODEL, config_version='v1',
                          heartbeat_ttl_seconds=86400)
    emit(event='started', expiresAt=utc_timestamp(state['expiresAt']),
         intervalSeconds=INTERVAL_SECONDS, maxModelCalls=MAX_MODEL_CALLS)

    while not stop:
        if once and state['accepted'] >= 1 and state['pending'] is None:
            emit(event='one-shot-complete', accepted=state['accepted'])
            return 0
        now = time.time()
        if now >= state['expiresAt']:
            emit(event='window-complete', attempts=state['attempts'],
                 accepted=state['accepted'], pending=state['pending'] is not None)
            return 0

        if state['pending'] is not None:
            if now < state['retryAt']:
                if once:
                    emit(event='one-shot-deferred', retryAt=utc_timestamp(state['retryAt']))
                    return 2
                time.sleep(min(30, state['retryAt'] - now))
                continue
            if send_pending(client, state_path, state):
                continue
            if once:
                return 2
            time.sleep(5)
            continue

        if state['attempts'] >= MAX_MODEL_CALLS:
            if once:
                return 2
            time.sleep(min(60, state['expiresAt'] - now))
            continue

        slot = max(state['nextSlot'], int((now - state['startedAt']) // INTERVAL_SECONDS))
        if slot >= MAX_MODEL_CALLS:
            time.sleep(min(60, state['expiresAt'] - now))
            continue
        scheduled = state['startedAt'] + slot * INTERVAL_SECONDS
        if now < scheduled:
            time.sleep(min(60, scheduled - now))
            continue

        # Advance the slot before external calls. A restart never catches up by
        # emitting a burst of missed hourly checks.
        state['nextSlot'] = slot + 1
        save_state(state_path, state)
        try:
            client.heartbeat(agent_ref=AGENT, environment='test',
                             deployment_ref=DEPLOYMENT,
                             sequence=state['heartbeatSequence'])
            state['heartbeatSequence'] += 1
            save_state(state_path, state)
        except IngestionError as error:
            emit(event='heartbeat-deferred', httpStatus=error.status)
            time.sleep(DELIVERY_RETRY_SECONDS)
            continue

        state['attempts'] += 1
        save_state(state_path, state)
        started = time.monotonic()
        signals, block = observe_chain(state['lastBlock'])
        decision = classify(api_key, signals, block)
        elapsed = min(86400000, max(0, round((time.monotonic() - started) * 1000)))
        run_id = str(uuid4())
        record = dict(
            event_id='watch-' + run_id, stream_ref=STREAM,
            sequence=state['sequence'], run_ref=run_id, agent_ref=AGENT,
            environment='test', deployment_ref=DEPLOYMENT,
            provider_ref='openai', model_ref=MODEL, config_version='v1',
            task_class='chain-health-watch', case_ref='hour-' + str(slot),
            status='completed' if decision else 'failed',
            occurred_at=utc_timestamp(), latency_ms=elapsed,
            predicted_label=decision,
            decision_code=decision or 'provider-unavailable',
            integration_version='python-chain-watch-v1')
        state['pending'] = {'record': record, 'block': block, 'slot': slot}
        state['retryAt'] = 0
        save_state(state_path, state)
        emit(event='check-complete', slot=slot, decision=decision or 'unavailable',
             block=block, modelCall=state['attempts'])
        send_pending(client, state_path, state)
        if once and state['pending'] is not None:
            return 2

    emit(event='stopped', attempts=state['attempts'], accepted=state['accepted'])
    return 0


if __name__ == '__main__':
    if sys.argv[1:] == ['--check-only']:
        signals, block = observe_chain(None)
        emit(event='chain-check', block=block, **signals)
        sys.exit(0 if signals['expectedChain'] and signals['blockAvailable']
                 and signals['contractPresent'] else 1)
    try:
        if sys.argv[1:] not in ([], ['--once']):
            raise ValueError('Unexpected agent argument')
        sys.exit(main(once=sys.argv[1:] == ['--once']))
    except (OSError, ValueError, IngestionError):
        emit(event='agent-exit', reason='configuration-or-transport')
        sys.exit(1)
