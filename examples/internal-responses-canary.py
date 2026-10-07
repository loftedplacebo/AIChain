"""Daily, content-free OpenAI Responses canary for one synthetic project.

The state file is written before the provider call, so a crash cannot cause a
second paid model call for the same UTC day. Only an allowlisted label and run
metadata reach Orvessian. The downloaded proof is checked by the independent
Node verifier, not by trusting the API's verification summary.
"""
import base64
import binascii
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'sdk' / 'python'))
from orvessian_ingest import Client, IngestionError

OPENAI_URL = 'https://api.openai.com/v1/responses'
API_ORIGIN = 'https://api.orvessian.com'
MODEL = 'gpt-4.1-mini'
AGENT = 'internal-responses-canary'
DEPLOYMENT = 'v1'
PROMPT = ('Synthetic test only. Classify an application with required information '
          'missing. Return the review decision in the required JSON shape.')
PENDING_STATES = {'queued', 'batched', 'submitted', 'confirming',
                  'not-found', 'unavailable'}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def emit(**fields):
    print(json.dumps(fields, separators=(',', ':')), flush=True)


def secret(name):
    value = os.environ.get(name, '')
    try:
        raw = base64.b64decode(value, validate=True).decode('ascii')
    except (binascii.Error, UnicodeDecodeError):
        raise ValueError('Invalid protected secret: ' + name) from None
    if not raw or '\n' in raw or '\r' in raw:
        raise ValueError('Invalid protected secret: ' + name)
    return raw


def setting(name):
    value = os.environ.get(name, '')
    if not value or '\n' in value or '\r' in value:
        raise ValueError('Missing setting: ' + name)
    return value


def save(path, state):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.canary-', dir=path.parent)
    try:
        if hasattr(os, 'fchmod'):
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(state, stream, sort_keys=True, separators=(',', ':'))
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def load(path):
    if not path.exists():
        return None
    info = path.lstat()
    if not path.is_file() or path.is_symlink() or os.name == 'posix' and info.st_mode & 0o077:
        raise ValueError('Canary state is not a protected regular file')
    state = json.loads(path.read_text(encoding='utf-8'))
    if isinstance(state, dict) and set(state) == {'version', 'date', 'phase', 'eventId', 'decision'}:
        state['attempts'] = 1
    if not isinstance(state, dict) or set(state) != {'version', 'date', 'phase', 'eventId', 'decision', 'attempts'} or \
            state['version'] != 1 or state['phase'] not in {'started', 'ready', 'submitted', 'verified'} or \
            not re.fullmatch(r'\d{4}-\d{2}-\d{2}', state['date']) or \
            state['eventId'] != 'canary-' + state['date'].replace('-', '') or \
            state['decision'] not in (None, 'review') or \
            type(state['attempts']) is not int or not 1 <= state['attempts'] <= 4:
        raise ValueError('Canary state is invalid; refusing to reset spend limit')
    return state


def classify(api_key):
    body = json.dumps({'model': MODEL, 'input': PROMPT, 'max_output_tokens': 32,
                       'store': False, 'temperature': 0,
                       'text': {'format': {'type': 'json_schema', 'name': 'canary_decision',
                                           'strict': True,
                                           'schema': {'type': 'object',
                                                      'properties': {'label': {'type': 'string',
                                                                               'enum': ['review']}},
                                                      'required': ['label'],
                                                      'additionalProperties': False}}}},
                      separators=(',', ':')).encode()
    req = Request(OPENAI_URL, data=body, headers={
        'Authorization': 'Bearer ' + api_key, 'Content-Type': 'application/json',
        'Accept': 'application/json'})
    try:
        with build_opener(ProxyHandler({}), NoRedirect()).open(req, timeout=20) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError('Provider response exceeds limit')
        result = json.loads(raw)
        if result.get('status') != 'completed':
            emit(event='provider-response-incomplete',
                 status=str(result.get('status', 'missing'))[:32],
                 outputTokens=result.get('usage', {}).get('output_tokens'))
            raise ValueError('Provider response incomplete')
        texts = [part.get('text') for item in result.get('output', [])
                 if item.get('type') == 'message' for part in item.get('content', [])
                 if part.get('type') == 'output_text']
        if len(texts) != 1 or not isinstance(texts[0], str) or \
                json.loads(texts[0]) != {'label': 'review'}:
            emit(event='provider-label-invalid', outputParts=len(texts),
                 outputTokens=result.get('usage', {}).get('output_tokens'))
            raise ValueError('Provider label outside allowlist')
        return 'review'
    except HTTPError as error:
        emit(event='provider-http-failed', status=error.code)
        raise RuntimeError('provider-or-label-failed') from None
    except (URLError, TimeoutError, OSError, ValueError, KeyError, TypeError,
            json.JSONDecodeError):
        raise RuntimeError('provider-or-label-failed') from None


def diagnose_key():
    req = Request('https://api.openai.com/v1/models/' + MODEL,
                  headers={'Authorization': 'Bearer ' + secret('OPENAI_API_KEY_B64'),
                           'Accept': 'application/json'})
    try:
        with build_opener(ProxyHandler({}), NoRedirect()).open(req, timeout=15) as response:
            response.read(1024)
            emit(event='provider-key-check', status=response.status)
            return 0 if response.status == 200 else 1
    except HTTPError as error:
        emit(event='provider-key-check', status=error.code)
        return 1
    except (URLError, OSError, TimeoutError, ValueError):
        emit(event='provider-key-check', status='transport-unavailable')
        return 1


def clients():
    if setting('ORVESSIAN_API_URL') != API_ORIGIN or setting('OPENAI_MODEL') != MODEL:
        raise ValueError('Unexpected API origin or model')
    tenant, project = setting('ORVESSIAN_TENANT'), setting('ORVESSIAN_PROJECT')
    write = Client(API_ORIGIN, secret('ORVESSIAN_TOKEN_B64'), tenant, project,
                   timeout=10, attempts=1)
    read = Client(API_ORIGIN, secret('ORVESSIAN_READ_TOKEN_B64'), tenant, project,
                  timeout=10, attempts=1)
    return write, read


def verify_export(exported, path):
    if not isinstance(exported, dict) or set(exported) != {'event', 'evidence', 'verification'}:
        raise ValueError('Unexpected evidence export')
    fd, temp = tempfile.mkstemp(prefix='.canary-evidence-', suffix='.json', dir=path.parent)
    try:
        if hasattr(os, 'fchmod'):
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(exported, stream, separators=(',', ':'))
        env = {'PATH': '/usr/bin:/bin',
               'GOVERNANCE_RECEIPT_SIGNERS': setting('GOVERNANCE_RECEIPT_SIGNERS'),
               'GOVERNANCE_EVIDENCE_RPC_URL': setting('GOVERNANCE_EVIDENCE_RPC_URL')}
        command = [setting('CANARY_NODE'), setting('CANARY_VERIFY_SCRIPT'),
                   'verify', temp]
        result = subprocess.run(command, env=env, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, timeout=30, check=False)
        return result.returncode
    finally:
        os.unlink(temp)


def run(now=None, *, model_call=classify, export_check=verify_export, sleep=time.sleep,
        operator_retry=False):
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(timezone.utc).date().isoformat()
    path = Path(setting('CANARY_STATE_FILE'))
    clients()
    secret('OPENAI_API_KEY_B64')
    setting('CANARY_NODE')
    setting('CANARY_VERIFY_SCRIPT')
    setting('GOVERNANCE_RECEIPT_SIGNERS')
    setting('GOVERNANCE_EVIDENCE_RPC_URL')
    state = load(path)
    newly_created = False
    if state and state['date'] != today:
        if state['phase'] != 'verified':
            emit(event='previous-run-incomplete', date=state['date'], phase=state['phase'])
            return 1
        state = None
    if state is None:
        state = {'version': 1, 'date': today, 'phase': 'started',
                 'eventId': 'canary-' + today.replace('-', ''), 'decision': None,
                 'attempts': 1}
        save(path, state)
        newly_created = True
    if state['phase'] == 'verified':
        emit(event='already-verified', eventId=state['eventId'])
        return 0
    if state['phase'] == 'started' and operator_retry:
        if newly_created or state['attempts'] >= 4:
            raise ValueError('Operator retry limit reached')
        state['attempts'] += 1
        save(path, state)
        newly_created = True
    return run_state(path, state, model_call=model_call, export_check=export_check,
                     sleep=sleep, newly_created=newly_created)


def run_state(path, state, *, model_call, export_check, sleep, newly_created=False):
    write, read = clients()
    if state['phase'] == 'started':
        if not newly_created:
            emit(event='model-attempt-uncertain', eventId=state['eventId'])
            return 1
        state['decision'] = model_call(secret('OPENAI_API_KEY_B64'))
        state['phase'] = 'ready'
        save(path, state)
    if state['phase'] == 'ready':
        date = datetime.strptime(state['date'], '%Y-%m-%d').date()
        sequence = date.toordinal()
        write.register_agent(agent_ref=AGENT, environment='test', deployment_ref=DEPLOYMENT,
                             owner_ref='orvessian-internal', purpose='Daily synthetic receipt canary',
                             model_ref=MODEL, config_version='v1', heartbeat_ttl_seconds=86400)
        write.record_run(event_id=state['eventId'], stream_ref='internal-responses-canary',
                         sequence=sequence, run_ref=state['eventId'], agent_ref=AGENT,
                         environment='test', deployment_ref=DEPLOYMENT,
                         provider_ref='openai', model_ref=MODEL, config_version='v1',
                         task_class='synthetic-classification', status='completed',
                         predicted_label=state['decision'], decision_code='review',
                         case_ref='daily-' + state['date'].replace('-', ''),
                         integration_version='python-responses-canary-v1')
        state['phase'] = 'submitted'
        save(path, state)
        emit(event='accepted', eventId=state['eventId'])
    deadline = time.monotonic() + 30 * 60
    while True:
        exported = read.evidence(state['eventId'])
        if exported.get('event', {}).get('eventId') != state['eventId']:
            raise ValueError('Read-back event mismatch')
        verification = exported.get('verification', {})
        if verification.get('state') == 'confirmed':
            if export_check(exported, path) != 0:
                emit(event='independent-verification-failed', eventId=state['eventId'])
                return 1
            state['phase'] = 'verified'
            save(path, state)
            emit(event='verified', eventId=state['eventId'])
            return 0
        if verification.get('state') not in PENDING_STATES:
            emit(event='evidence-failed', eventId=state['eventId'],
                 state=str(verification.get('state', 'missing'))[:40])
            return 1
        if time.monotonic() >= deadline:
            emit(event='evidence-timeout', eventId=state['eventId'])
            return 1
        sleep(15)


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--diagnose-key']:
            sys.exit(diagnose_key())
        if sys.argv[1:] == ['--operator-retry']:
            sys.exit(run(operator_retry=True))
        if sys.argv[1:]:
            raise ValueError('Unexpected canary argument')
        sys.exit(run())
    except (OSError, ValueError, IngestionError, RuntimeError, subprocess.TimeoutExpired):
        emit(event='canary-failed', reason='configuration-provider-or-transport')
        sys.exit(1)
