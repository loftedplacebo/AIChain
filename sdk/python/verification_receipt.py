"""General verification receipt alpha. Exact-byte evidence; no network dependencies."""
import hashlib
import re
import secrets
from datetime import datetime
from receipt import canonicalize

SCHEMA = 'aichain.verification-receipt'
VERSION = '0.4.0-alpha'
DOMAIN = f'aichain:verification-receipt:{VERSION}:'
MAX_BYTES = 12288
HEX = r'0x[0-9a-f]{64}'
ADDRESS = r'0x[0-9a-f]{40}'
NAME = r'[a-z][a-z0-9.-]*:[a-z][a-z0-9._-]*'
DECIMAL = r'(0|[1-9][0-9]{0,77})'


def _require(ok, message):
    if not ok:
        raise ValueError(message)


def _shape(value, required, optional=()):
    _require(isinstance(value, dict) and set(required).issubset(value) and set(value).issubset(set(required) | set(optional)), f'Expected fields: {required}')


def _string(value, pattern, maximum=160):
    _require(isinstance(value, str) and len(value) <= maximum and re.fullmatch(pattern, value) is not None, 'Invalid bounded string')


def _digest(value):
    _string(value, HEX)


def _decimal(value):
    _string(value, DECIMAL, 78)


def _hash(domain, value):
    if isinstance(value, str):
        value = value.encode('utf-8')
    return '0x' + hashlib.sha256(domain.encode('utf-8') + value).hexdigest()


def _descriptor(value):
    _shape(value, ('scheme', 'digest', 'mediaType'))
    _require(value['scheme'] in ('sha256', 'sha256-salted-v1'), 'Unsupported commitment scheme')
    _digest(value['digest'])
    _string(value['mediaType'], r'[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*', 128)


def validate_verification_receipt(receipt):
    _shape(receipt, ('schema', 'schemaVersion', 'profile', 'context', 'issuer', 'subject', 'event', 'commitments', 'links'))
    _require(receipt['schema'] == SCHEMA and receipt['schemaVersion'] == VERSION, 'Unsupported verification receipt schema')
    profile = receipt['profile']
    _shape(profile, ('id', 'version', 'digest'))
    _string(profile['id'], r'(urn:|https://)[!-~]+', 256)
    _string(profile['version'], r'[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?', 64)
    _digest(profile['digest'])
    context = receipt['context']
    _shape(context, ('chainId', 'anchorContract'))
    _decimal(context['chainId'])
    _require(0 < int(context['chainId']) < 2**256, 'Invalid chain ID')
    _string(context['anchorContract'], ADDRESS)
    _string(receipt['issuer'], ADDRESS)
    _require(context['anchorContract'] != '0x' + '0' * 40 and receipt['issuer'] != '0x' + '0' * 40, 'Zero address is not allowed')
    _shape(receipt['subject'], ('kind', 'id'))
    _string(receipt['subject']['kind'], NAME)
    _digest(receipt['subject']['id'])
    event = receipt['event']
    _shape(event, ('id', 'type', 'claimedAt'), ('observation', 'stream'))
    _digest(event['id'])
    _string(event['type'], NAME)
    _string(event['claimedAt'], r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z')
    datetime.fromisoformat(event['claimedAt'].replace('Z', '+00:00'))
    if 'observation' in event:
        observation = event['observation']
        _shape(observation, ('clock', 'ticksNs', 'uncertaintyNs'))
        _require(observation['clock'] in ('utc', 'monotonic', 'simulation'), 'Unsupported observation clock')
        _decimal(observation['ticksNs'])
        if observation['uncertaintyNs'] is not None:
            _decimal(observation['uncertaintyNs'])
    if 'stream' in event:
        stream = event['stream']
        _shape(stream, ('id', 'sequence', 'previousReceiptId'))
        _digest(stream['id'])
        _decimal(stream['sequence'])
        if stream['sequence'] == '0':
            _require(stream['previousReceiptId'] is None, 'First stream receipt must have no predecessor')
        else:
            _digest(stream['previousReceiptId'])
    commitments = receipt['commitments']
    _require(isinstance(commitments, dict) and 1 <= len(commitments) <= 32, 'Expected 1..32 evidence commitments')
    for role, evidence in commitments.items():
        _string(role, NAME)
        _descriptor(evidence)
    links = receipt['links']
    _require(isinstance(links, list) and len(links) <= 32, 'Expected at most 32 receipt links')
    for link in links:
        _shape(link, ('relation', 'receiptId'))
        _string(link['relation'], NAME)
        _digest(link['receiptId'])
    _require(len({canonicalize(link) for link in links}) == len(links), 'Duplicate receipt links')
    _require(len(canonicalize(receipt).encode('utf-8')) <= MAX_BYTES, 'Receipt exceeds byte limit')


def validate_profile_definition(profile):
    _shape(profile, ('id', 'version', 'specificationDigest', 'subjectKinds', 'requiredEvidence', 'requireStream', 'requireObservation'))
    _digest(profile['specificationDigest'])
    _string(profile['id'], r'(urn:|https://)[!-~]+', 256)
    _string(profile['version'], r'[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?', 64)
    for field in ('subjectKinds', 'requiredEvidence'):
        values = profile[field]
        _require(isinstance(values, list) and len(values) <= 32, f'Invalid {field}')
        for value in values:
            _string(value, NAME)
        _require(len(set(values)) == len(values), f'Duplicate {field}')
    _require(type(profile['requireStream']) is bool and type(profile['requireObservation']) is bool, 'Profile requirements must be booleans')


def profile_reference(profile):
    validate_profile_definition(profile)
    return {'id': profile['id'], 'version': profile['version'], 'digest': _hash(DOMAIN + 'profile:', canonicalize(profile))}


def validate_receipt_profile(receipt, profile):
    validate_verification_receipt(receipt)
    _require(receipt['profile'] == profile_reference(profile), 'Profile definition does not match pinned reference')
    _require(not profile['subjectKinds'] or receipt['subject']['kind'] in profile['subjectKinds'], 'Unsupported subject kind for profile')
    _require(all(role in receipt['commitments'] for role in profile['requiredEvidence']), 'Required profile evidence is missing')
    _require(not profile['requireStream'] or 'stream' in receipt['event'], 'Profile requires stream continuity')
    _require(not profile['requireObservation'] or 'observation' in receipt['event'], 'Profile requires observation clock')
    return {'profileValidated': True, 'profileId': profile['id'], 'scope': 'Evidence shape only; evidence contents and claims are not appraised.'}


def create_verification_receipt(fields, profile):
    import json
    _shape(fields, ('context', 'issuer', 'subject', 'event', 'commitments'), ('links',))
    receipt = {'schema': SCHEMA, 'schemaVersion': VERSION, **fields, 'links': fields.get('links', []), 'profile': profile_reference(profile)}
    validate_receipt_profile(receipt, profile)
    return json.loads(canonicalize(receipt))


def derive_verification_receipt(receipt):
    validate_verification_receipt(receipt)
    payload, commitments = canonicalize(receipt), canonicalize(receipt['commitments'])
    return {'canonicalReceipt': payload, 'canonicalCommitments': commitments, 'receiptId': _hash(DOMAIN, payload), 'commitmentsRoot': _hash(DOMAIN + 'commitments:', commitments)}


def prepare_verification_anchor(receipt):
    derived = derive_verification_receipt(receipt)
    return {key: derived[key] for key in ('receiptId', 'commitmentsRoot')} | {'schemaVersion': VERSION, 'claimedIssuer': receipt['issuer'], **receipt['context']}


def commit_evidence(data, media_type, salt=None):
    _require(isinstance(data, bytes), 'Evidence must be bytes')
    if salt is None:
        salt = '0x' + secrets.token_hex(32)
    _digest(salt)
    commitment = {'scheme': 'sha256-salted-v1', 'mediaType': media_type, 'digest': _hash(DOMAIN + 'evidence:', bytes.fromhex(salt[2:]) + data)}
    _descriptor(commitment)
    return {'commitment': commitment, 'salt': salt}


def verify_evidence(commitment, data, salt=None):
    _descriptor(commitment)
    _require(isinstance(data, bytes), 'Evidence must be bytes')
    if commitment['scheme'] == 'sha256':
        return salt is None and _hash('', data) == commitment['digest']
    _digest(salt)
    return commit_evidence(data, commitment['mediaType'], salt)['commitment']['digest'] == commitment['digest']


def commit_evidence_stream(chunks, media_type, salt=None):
    if salt is None:
        salt = '0x' + secrets.token_hex(32)
    _digest(salt)
    commitment = {'scheme': 'sha256-salted-v1', 'mediaType': media_type, 'digest': '0x' + '0' * 64}
    _descriptor(commitment)
    hasher = hashlib.sha256((DOMAIN + 'evidence:').encode('utf-8') + bytes.fromhex(salt[2:]))
    for chunk in chunks:
        _require(isinstance(chunk, bytes), 'Evidence chunks must be bytes')
        hasher.update(chunk)
    commitment['digest'] = '0x' + hasher.hexdigest()
    return {'commitment': commitment, 'salt': salt}


def prepare_verification_attestation(receipt):
    receipt_id = derive_verification_receipt(receipt)['receiptId']
    return {'scheme': 'eip191-personal-sign', 'receiptId': receipt_id, 'issuer': receipt['issuer'], 'message': f'AIChain Verification Receipt {VERSION}: {receipt_id}'}


def verify_stream_link(previous, current):
    prior = derive_verification_receipt(previous)
    validate_verification_receipt(current)
    a, b = previous['event'].get('stream'), current['event'].get('stream')
    return bool(a and b and all(previous[key] == current[key] for key in ('context', 'issuer', 'subject', 'profile')) and a['id'] == b['id'] and int(b['sequence']) == int(a['sequence']) + 1 and b['previousReceiptId'] == prior['receiptId'])
