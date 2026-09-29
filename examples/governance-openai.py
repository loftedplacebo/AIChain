"""One explicit live provider smoke test with a synthetic prompt. No auto-review.

Set OPENAI_API_KEY, OPENAI_MODEL and all ORVESSIAN client/queue variables.
Use --live to acknowledge the single bounded provider request. Default is no call.
"""
import os
import sys
import json
import argparse
from pathlib import Path
from uuid import uuid4
os.environ['LANGSMITH_TRACING']='false'
os.environ['LANGCHAIN_TRACING_V2']='false'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'sdk'/'python'))
from orvessian_ingest import Client
from orvessian_langchain import DeliveryQueue,GovernanceCallback
from orvessian_openai import create_chat_model,decision_chain

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true')
    parser.add_argument('--env-file')
    args=parser.parse_args()
    if not args.live:
        print('No provider request made. Configure local variables and pass --live.')
        return
    if args.env_file:
        for line in Path(args.env_file).read_text(encoding='utf-8-sig').splitlines():
            if not line.strip() or line.lstrip().startswith('#'): continue
            name,separator,value=line.partition('=')
            if not separator or name.strip() not in ('OPENAI_API_KEY','OPENAI_MODEL'):
                raise ValueError('Invalid local provider configuration')
            os.environ[name.strip()]=value.strip().strip('\"').strip("'")
    names=('OPENAI_API_KEY','OPENAI_MODEL','ORVESSIAN_API_URL','ORVESSIAN_TOKEN','ORVESSIAN_TENANT','ORVESSIAN_PROJECT','ORVESSIAN_QUEUE_PATH')
    if any(not os.environ.get(name) for name in names):
        raise ValueError('Required local configuration is missing')
    client=Client(os.environ['ORVESSIAN_API_URL'],os.environ['ORVESSIAN_TOKEN'],os.environ['ORVESSIAN_TENANT'],os.environ['ORVESSIAN_PROJECT'])
    queue=DeliveryQueue(os.environ['ORVESSIAN_QUEUE_PATH'],client)
    try:
        model=create_chat_model(api_key=os.environ['OPENAI_API_KEY'],model=os.environ['OPENAI_MODEL'])
        h=GovernanceCallback(queue,run_id=uuid4(),agent_ref='openai-smoke-agent',environment='test',deployment_ref='openai-smoke-v1',provider_ref='openai',model_ref=os.environ['OPENAI_MODEL'],config_version='v1',task_class='classification',case_ref='synthetic-case-1',decision_labels=('approve','review','reject'))
        client.register_agent(agent_ref='openai-smoke-agent',environment='test',deployment_ref='openai-smoke-v1',owner_ref='demo-team',purpose='Synthetic provider smoke test',model_ref=os.environ['OPENAI_MODEL'],config_version='v1')
        succeeded=False
        failure='none'
        try:
            decision_chain(model,h).invoke('Synthetic test: an application is missing required information. Return exactly review with no other text.',{'callbacks':[h],'run_id':h.run_id})
            succeeded=True
        except Exception as error:
            # Do not print provider exception bodies, keys, prompts or output.
            status=getattr(error,'status_code',None)
            failure=('http-'+str(status)) if type(status) is int and 100<=status<=599 else 'transport-or-decision-mapping'
        acknowledged=queue.flush()
        print(json.dumps({'providerSucceeded':succeeded,'providerFailure':failure,'eventId':'lc-'+str(h.run_id),'capture':h.capture_status,'acknowledged':acknowledged,'pending':queue.pending}))
        if not succeeded or h.capture_status!='queued': sys.exit(1)
    finally: queue.close()

if __name__=='__main__':
    try: main()
    except Exception:
        print('Smoke test could not complete; check local configuration and pending queue.',file=sys.stderr)
        sys.exit(1)
