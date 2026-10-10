"""One bounded OpenAI classification run submitted to the hosted Orvessian API.

The prompt is fixed and synthetic. Only the mapped decision and selected run
metadata are sent to Orvessian; prompts, completions and provider errors are not
written to the governance record or printed.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'sdk' / 'python'))

from orvessian_ingest import Client, IngestionError
from orvessian_langchain import DeliveryQueue, GovernanceCallback
from orvessian_openai import create_chat_model, decision_chain

OPENAI_ENV = {'OPENAI_API_KEY', 'OPENAI_MODEL'}
ORVESSIAN_ENV = {'ORVESSIAN_API_URL', 'ORVESSIAN_TOKEN', 'ORVESSIAN_TENANT',
                 'ORVESSIAN_PROJECT', 'ORVESSIAN_QUEUE_PATH'}
ORVESSIAN_READ_ENV = {'ORVESSIAN_READ_TOKEN'}
LABELS = ('approve', 'review', 'reject')
AGENT = 'openai-synthetic-reviewer'
DEPLOYMENT = 'openai-synthetic-reviewer-v1'
PROMPT = ('Synthetic test only: an application is missing required information. '
          'Return exactly review with no other text.')


def load_env_file(path, allowed):
    """Load a narrow allowlist of values without echoing them."""
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        name, separator, value = line.partition('=')
        name = name.strip()
        if not separator or name not in allowed:
            raise ValueError('Invalid local configuration file')
        os.environ[name] = value.strip().strip('"').strip("'")


def safe_status(error):
    status = getattr(error, 'status', None)
    if status is None:
        status = getattr(error, 'status_code', None)
    return status if type(status) is int and 100 <= status <= 599 else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true',
                        help='Make one bounded synthetic OpenAI request and submit its metadata')
    parser.add_argument('--openai-env-file', required=True,
                        help='Ignored local env file containing OPENAI_API_KEY and OPENAI_MODEL')
    parser.add_argument('--orvessian-env-file', required=True,
                        help='Ignored local env file containing the hosted project settings')
    parser.add_argument('--wait-seconds', type=int, default=90,
                        help='Maximum evidence polling time, 0–300 seconds (default 90)')
    args = parser.parse_args()
    if not args.live:
        print('No provider request made. Review configuration, then pass --live for one synthetic run.')
        return 0
    if not 0 <= args.wait_seconds <= 300:
        raise ValueError('Evidence wait must be between 0 and 300 seconds')

    load_env_file(args.openai_env_file, OPENAI_ENV)
    load_env_file(args.orvessian_env_file, ORVESSIAN_ENV | ORVESSIAN_READ_ENV)
    required = OPENAI_ENV | ORVESSIAN_ENV
    if any(not os.environ.get(name) for name in required):
        raise ValueError('Required local configuration is missing')

    openai_key = os.environ['OPENAI_API_KEY']
    model_ref = os.environ['OPENAI_MODEL']
    api = Client(os.environ['ORVESSIAN_API_URL'], os.environ['ORVESSIAN_TOKEN'],
                 os.environ['ORVESSIAN_TENANT'], os.environ['ORVESSIAN_PROJECT'])
    read_api = None
    if os.environ.get('ORVESSIAN_READ_TOKEN'):
        read_api = Client(os.environ['ORVESSIAN_API_URL'], os.environ['ORVESSIAN_READ_TOKEN'],
                          os.environ['ORVESSIAN_TENANT'], os.environ['ORVESSIAN_PROJECT'])
    queue = DeliveryQueue(os.environ['ORVESSIAN_QUEUE_PATH'], api)
    run_id = uuid4()
    handler = GovernanceCallback(
        queue, run_id=run_id, agent_ref=AGENT, environment='test',
        deployment_ref=DEPLOYMENT, provider_ref='openai', model_ref=model_ref,
        config_version='v1', task_class='classification', case_ref='synthetic-case-1',
        decision_labels=LABELS,
    )
    event_id = 'lc-' + str(run_id)
    started = time.monotonic()
    provider_succeeded = False
    provider_failure = 'none'
    decision = None
    acknowledged = 0
    evidence = {'state': 'not-checked'}
    try:
        api.register_agent(
            agent_ref=AGENT, environment='test', deployment_ref=DEPLOYMENT,
            owner_ref='demo-team', purpose='Bounded synthetic OpenAI classification demo',
            model_ref=model_ref, config_version='v1',
        )
        model = create_chat_model(api_key=openai_key, model=model_ref)
        try:
            decision = decision_chain(model, handler).invoke(
                PROMPT, {'callbacks': [handler], 'run_id': handler.run_id})
            provider_succeeded = handler.capture_status == 'queued'
        except Exception as error:
            status = safe_status(error)
            provider_failure = 'http-' + str(status) if status else 'provider-or-decision-mapping'

        acknowledged = queue.flush()
        if provider_succeeded and handler.capture_status == 'queued' and acknowledged and read_api:
            deadline = time.monotonic() + args.wait_seconds
            while True:
                try:
                    result = read_api.evidence(event_id)
                    current = result.get('verification', {})
                    evidence = {name: current[name] for name in
                                ('state', 'signature', 'recordCommitment', 'batchMembership',
                                 'confirmations', 'minimumConfirmations', 'transactionHash')
                                if name in current}
                    if evidence.get('state') not in ('queued', 'batched', 'submitted', 'confirming'):
                        break
                except IngestionError as error:
                    status = safe_status(error)
                    evidence = {'state': 'read-unavailable-http-' + str(status) if status else 'read-unavailable'}
                    break
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                time.sleep(min(5, remaining))
        elif provider_succeeded and not read_api:
            evidence = {'state': 'read-key-missing'}

        output = {
            'providerSucceeded': provider_succeeded,
            'providerFailure': provider_failure,
            'eventId': event_id,
            'decision': decision if provider_succeeded else None,
            'capture': handler.capture_status,
            'acknowledged': acknowledged,
            'pending': queue.pending,
            'evidence': evidence,
            'elapsedMs': min(86400000, round((time.monotonic() - started) * 1000)),
        }
        print(json.dumps(output, separators=(',', ':')))
        return 0 if provider_succeeded and acknowledged == 1 else 1
    finally:
        queue.close()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        status = safe_status(error)
        reason = 'http-' + str(status) if status else 'configuration-or-transport'
        print(json.dumps({'error': reason}), file=sys.stderr)
        sys.exit(1)
