"""Optional OpenAI Chat Completions path. Decision extraction is customer-side."""
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableLambda
from orvessian_ingest import _ref

def create_chat_model(*, api_key, model, http_client=None):
    if not isinstance(api_key,str) or not api_key:
        raise ValueError('Configure a local provider key')
    return ChatOpenAI(api_key=api_key, model=_ref(model),
                      base_url='https://api.openai.com/v1', use_responses_api=False,
                      max_completion_tokens=128, timeout=20, max_retries=0,
                      store=False, http_client=http_client)

def decision_chain(model, handler):
    """Map a fixed code only; never forward free text or provider metadata.

    This example vocabulary must match handler.decision_labels. A refusal,
    truncation, tool call or unknown answer is a failed mapping, not a decision.
    """
    def select(message):
        if message.response_metadata.get('finish_reason') != 'stop' or message.additional_kwargs.get('refusal') or message.tool_calls:
            raise ValueError('Provider did not return a complete decision')
        if not isinstance(message.content,str) or len(message.content)>32:
            raise ValueError('Provider decision is outside the configured vocabulary')
        label = message.content.strip()
        handler.set_decision(label)
        return label
    return RunnableLambda(lambda value:value) | model | RunnableLambda(select)
