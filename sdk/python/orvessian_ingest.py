"""Orvessian ingestion client 0.1.0-alpha. Standard library; synchronous and bounded.

Only selected structured run metadata is emitted. No automatic instrumentation,
background queue, prompts, responses or tool payload capture. Receipt verification
uses the existing independent verification tooling, not a trust in API status.
"""
import json
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

VERSION = '0.1.0-alpha'

class IngestionError(Exception):
    def __init__(self, status=None):
        self.status = status
        super().__init__('Orvessian request failed' + (f' (HTTP {status})' if status else ' (transport unavailable)'))

class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def _ref(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,128}', value):
        raise ValueError('Expected a bounded opaque reference')
    return value

def _environment(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,64}', value):
        raise ValueError('Expected a bounded environment reference')
    return value

class Client:
    def __init__(self, base_url, token, tenant, project, *, timeout=10, attempts=3):
        url = urlsplit(base_url)
        if url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
            raise ValueError('Use an API origin without credentials, path or query')
        if not url.hostname or (url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1', '::1'))):
            raise ValueError('HTTPS required except for explicit loopback development')
        if not isinstance(token, str) or len(token) < 32 or '\n' in token or '\r' in token:
            raise ValueError('A scoped project credential is required')
        if type(attempts) is not int or not 1 <= attempts <= 5 or type(timeout) not in (int, float) or not 0 < timeout <= 60:
            raise ValueError('Use 1–5 attempts and a timeout up to 60 seconds')
        self.__base_url, self._token = base_url.rstrip('/'), token
        self.__tenant, self.__project = _ref(tenant), _ref(project)
        self.__timeout, self.__attempts = timeout, attempts
        self._opener = build_opener(_NoRedirect())

    @property
    def base_url(self): return self.__base_url

    @property
    def tenant(self): return self.__tenant

    @property
    def project(self): return self.__project

    @property
    def timeout(self): return self.__timeout

    @property
    def attempts(self): return self.__attempts

    def _request(self, path, body=None):
        # Encode once: every retry carries the same identity and bytes.
        data = None if body is None else json.dumps(body, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')
        if data is not None and len(data) > (4096 if path.startswith('/v1/agents') else 65536):
            raise ValueError('Request exceeds the API size limit')
        for attempt in range(self.attempts):
            req = Request(self.base_url + path, data=data, headers={'Authorization': 'Bearer '+self._token, 'Content-Type': 'application/json'})
            try:
                with self._opener.open(req, timeout=self.timeout) as response:
                    payload = response.read(2 * 1024 * 1024 + 1)
                    if len(payload) > 2 * 1024 * 1024:
                        raise IngestionError(response.status)
                    try:
                        return json.loads(payload)
                    except (ValueError, UnicodeError):
                        raise IngestionError(response.status) from None
            except HTTPError as exc:
                status = exc.code
                exc.close()
                if status not in (408, 429, 500, 502, 503, 504) or attempt + 1 == self.attempts:
                    raise IngestionError(status) from None
            except (URLError, TimeoutError, OSError):
                if attempt + 1 == self.attempts:
                    raise IngestionError() from None
            time.sleep(min(0.25 * 2 ** attempt, 2))

    def register_agent(self, *, agent_ref, environment, deployment_ref, owner_ref, purpose, model_ref, config_version, heartbeat_ttl_seconds=300):
        body = dict(agentRef=_ref(agent_ref), environment=_environment(environment), deploymentRef=_ref(deployment_ref), ownerRef=_ref(owner_ref), purpose=purpose, modelRef=_ref(model_ref), configVersion=_ref(config_version), heartbeatTtlSeconds=heartbeat_ttl_seconds)
        if not isinstance(purpose, str) or not purpose.strip() or len(purpose)>256 or any(ord(c)<32 for c in purpose):
            raise ValueError('Purpose must be a short business description, never source content')
        if type(heartbeat_ttl_seconds) is not int or not 60<=heartbeat_ttl_seconds<=86400:
            raise ValueError('Heartbeat TTL must be 60–86400 seconds')
        return self._request('/v1/agents', body)

    def heartbeat(self, *, agent_ref, environment, deployment_ref, sequence):
        if type(sequence) is not int or not 0 <= sequence <= 9007199254740991:
            raise ValueError('Persist an increasing heartbeat sequence across restarts')
        return self._request('/v1/agents/heartbeat', dict(agentRef=_ref(agent_ref), environment=_environment(environment), deploymentRef=_ref(deployment_ref), sequence=sequence))

    def record_run(self, *, event_id, stream_ref, sequence, run_ref, agent_ref, environment, deployment_ref, provider_ref, model_ref, config_version, task_class, status, occurred_at=None, latency_ms=None, predicted_label=None, integration_version='python-'+VERSION, case_ref=None, decision_code=None, tool_calls=None):
        if type(sequence) is not int or not 0<=sequence<=9007199254740991:
            raise ValueError('Use a stable nonnegative sequence')
        if status not in ('completed','blocked','escalated','failed','pending'):
            raise ValueError('Unsupported run status')
        timestamp = occurred_at or datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
        if not isinstance(timestamp,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z',timestamp):
            raise ValueError('Use a UTC timestamp with milliseconds')
        datetime.fromisoformat(timestamp.replace('Z','+00:00'))
        activity={'taskClass':_ref(task_class)}
        if tool_calls is not None:
            if not isinstance(tool_calls, list) or len(tool_calls) > 100:
                raise ValueError('At most 100 structured tool observations')
            observations = []
            for call in tool_calls:
                if not isinstance(call, dict) or set(call) - {'toolRef','version','resultCode','allowed'}:
                    raise ValueError('Unsupported tool observation')
                observation = {key:_ref(call.get(key)) for key in ('toolRef','version','resultCode')}
                if 'allowed' in call:
                    if type(call['allowed']) is not bool: raise ValueError('Tool allowed must be boolean')
                    observation['allowed'] = call['allowed']
                observations.append(observation)
            activity['toolCalls'] = observations
        if latency_ms is not None:
            if type(latency_ms) is not int or not 0<=latency_ms<=86400000: raise ValueError('Invalid latency')
            activity['latencyMs']=latency_ms
        result={'status':status}
        if predicted_label is not None: result['predictedLabel']=_ref(predicted_label)
        body=dict(schema='aichain.governance-event',schemaVersion='0.1.0-draft',profile='urn:orvessian:agent-run:v1',tenantRef=self.tenant,projectRef=self.project,environment=_environment(environment),eventId=_ref(event_id),streamRef=_ref(stream_ref),sequence=str(sequence),runRef=_ref(run_ref),agentRef=_ref(agent_ref),occurredAt=timestamp,eventType='ai.run.completed',source={'kind':'customer-sdk','integrationVersion':'python-'+VERSION,'keyRef':'project-credential'},model=dict(providerRef=_ref(provider_ref),modelRef=_ref(model_ref),deploymentRef=_ref(deployment_ref),configVersion=_ref(config_version)),activity=activity,result=result)
        body['source']['integrationVersion'] = _ref(integration_version)
        if case_ref is not None: body['caseRef'] = _ref(case_ref)
        if decision_code is not None: body['result']['decisionCode'] = _ref(decision_code)
        return self._submit(body)

    def _submit(self, body):
        acknowledgement = self._request('/v1/events', body)
        if not isinstance(acknowledgement, dict) or acknowledgement.get('eventId') != body['eventId'] or acknowledgement.get('status') not in ('accepted', 'duplicate'):
            raise IngestionError() from None
        return acknowledgement

    def build_outcome(self, *, event_id, for_event_id, case_ref, environment, label,
                      label_source, evaluator_ref, rubric_version, occurred_at):
        sources = {'human-adjudication':'human-reviewer', 'calibrated-measurement':'downstream-system',
                   'downstream-system':'downstream-system', 'customer-feedback':'customer-gateway',
                   'automated-evaluator':'customer-sdk'}
        if label_source not in sources: raise ValueError('Invalid outcome source')
        if not isinstance(occurred_at,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z',occurred_at):
            raise ValueError('Persist a UTC outcome timestamp with milliseconds')
        datetime.fromisoformat(occurred_at.replace('Z','+00:00'))
        return dict(schema='aichain.governance-event', schemaVersion='0.1.0-draft',
                    profile='urn:orvessian:agent-run:v1', tenantRef=self.tenant, projectRef=self.project,
                    environment=_environment(environment), eventId=_ref(event_id), streamRef=_ref(event_id),
                    sequence='0', caseRef=_ref(case_ref), occurredAt=occurred_at, eventType='ai.outcome.adjudicated',
                    source=dict(kind=sources[label_source], integrationVersion='python-'+VERSION,keyRef='project-credential'),
                    outcome=dict(forEventId=_ref(for_event_id),label=_ref(label),labelSource=label_source,
                                 evaluatorRef=_ref(evaluator_ref),rubricVersion=_ref(rubric_version),adjudicatedAt=occurred_at))

    def record_outcome(self, **record):
        return self._submit(self.build_outcome(**record))

    def agents(self, limit=50, offset=0):
        if type(limit) is not int or not 1<=limit<=100 or type(offset) is not int or not 0<=offset<=1000: raise ValueError('Invalid pagination')
        return self._request(f'/v1/agents?limit={limit}&offset={offset}')

    def evidence(self, event_id):
        return self._request('/v1/evidence/'+quote(_ref(event_id),safe=''))
