import copy
import hashlib
import json
from pathlib import Path
import pytest
from verification_receipt import (
    commit_evidence, commit_evidence_stream, create_verification_receipt, derive_verification_receipt,
    prepare_verification_anchor, prepare_verification_attestation, profile_reference,
    validate_receipt_profile, verify_evidence, verify_stream_link,
)
from avr_presentation import create_presentation, derive_presentation, assurance_summary

ROOT = Path(__file__).parents[2]
FIXTURES = [json.loads(path.read_text(encoding='utf-8')) for path in sorted((ROOT / 'fixtures/verification-receipt').glob('*.json'))]
ROBOT = next(f for f in FIXTURES if f['profile']['id'].endswith(':robotics'))


@pytest.mark.parametrize('fixture', FIXTURES, ids=lambda f: f['profile']['id'])
def test_cross_language_golden_and_evidence(fixture):
    receipt = fixture['receipt']
    assert derive_verification_receipt(receipt) == fixture['expected']
    name = fixture['profile']['id'].split(':')[-1]
    specification = (ROOT / 'spec/verification-receipt/profiles' / (name + '.md')).read_bytes()
    assert '0x' + hashlib.sha256(specification).hexdigest() == fixture['profile']['specificationDigest']
    assert validate_receipt_profile(receipt, fixture['profile'])['profileValidated']
    for evidence in fixture['disclosures'].values():
        data = bytes.fromhex(evidence['bytesHex'])
        assert verify_evidence(evidence['commitment'], data, evidence['salt'])
        assert not verify_evidence(evidence['commitment'], data + b'!', evidence['salt'])
        assert not verify_evidence(evidence['commitment'], data, '0x' + 'ff' * 32)
    presentation = create_presentation(receipt, {'level': 'commitment-only'})
    assert presentation['receiptId'] == fixture['expected']['receiptId']
    assert derive_presentation(presentation)['presentationId'] == fixture['presentationId']
    assert prepare_verification_anchor(receipt)['chainId'] == receipt['context']['chainId']
    assert prepare_verification_attestation(receipt)['message'].endswith(fixture['expected']['receiptId'])


def test_independent_profile_and_missing_semantics():
    profile = {**ROBOT['profile'], 'id': 'urn:example:inspection', 'requiredEvidence': ['vendor:inspection']}
    receipt = copy.deepcopy(ROBOT['receipt'])
    receipt['profile'] = profile_reference(profile)
    receipt['commitments']['vendor:inspection'] = receipt['commitments']['machine:event']
    assert validate_receipt_profile(receipt, profile)['profileValidated']
    with pytest.raises(ValueError, match='pinned'):
        validate_receipt_profile(receipt, {**profile, 'requireStream': False})
    del receipt['commitments']['vendor:inspection']
    with pytest.raises(ValueError, match='missing'):
        validate_receipt_profile(receipt, profile)


@pytest.mark.parametrize('path,value', [
    (('schemaVersion',), '1.0.0'), (('extra',), {}),
    (('event','claimedAt'), '2026-02-30T12:00:00.000Z'),
    (('event','claimedAt'), '0000-01-01T00:00:00.000Z'),
    (('event','claimedAt'), '2026-09-12T12:00:00Z'),
    (('event','stream','sequence'), 1), (('event','stream','sequence'), '01'),
    (('event','stream','sequence'), '-1'), (('event','stream','sequence'), '1'),
    (('event','stream','previousReceiptId'), '0x'+'cc'*32),
    (('event','observation','ticksNs'), 9007199254740992),
    (('event','observation','clock'), 'gps'),
    (('context','chainId'), '0'), (('context','chainId'), str(2**256)),
    (('issuer',), '0x'+'BB'*20), (('context','anchorContract'), '0x'+'00'*20),
    (('issuer',), '0x'+'bb'*20+'\n'),
    (('subject','kind'), '\U0001f916'), (('commitments',), {}),
    (('commitments','machine:event','scheme'), 'unknown'),
    (('commitments','machine:event','salt'), 'secret'),
])
def test_reject_ambiguous_and_malformed(path, value):
    receipt = copy.deepcopy(ROBOT['receipt'])
    target = receipt
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(ValueError):
        derive_verification_receipt(receipt)


def test_stream_gaps_and_scope_changes():
    previous, current = copy.deepcopy(ROBOT['receipt']), copy.deepcopy(ROBOT['receipt'])
    current['event']['stream'].update(sequence='1', previousReceiptId=derive_verification_receipt(previous)['receiptId'])
    assert verify_stream_link(previous, current)
    current['event']['stream']['sequence'] = '2'
    assert not verify_stream_link(previous, current)
    current['event']['stream']['sequence'] = '1'
    current['subject']['id'] = '0x' + 'cc'*32
    assert not verify_stream_link(previous, current)


def test_random_salt_private_by_default():
    a, b = commit_evidence(b'yes', 'text/plain'), commit_evidence(b'yes', 'text/plain')
    assert a['commitment']['digest'] != b['commitment']['digest']
    assert 'salt' not in a['commitment']
    with pytest.raises(ValueError):
        verify_evidence(a['commitment'], b'yes')


def test_streaming_matches_byte_commitment():
    data, salt = 'telemetry — 🤖'.encode('utf-8'), '0x' + '11'*32
    assert commit_evidence_stream([data[:3], data[3:]], 'application/octet-stream', salt) == commit_evidence(data, 'application/octet-stream', salt)
    with pytest.raises(ValueError, match='bytes'):
        commit_evidence_stream(['text'], 'text/plain', salt)


def test_presentation_assurance_and_replay_boundaries():
    receipt = ROBOT['receipt']
    for level in ('zk-proved', 'organisation-authorised'):
        with pytest.raises(ValueError, match='adapter'):
            create_presentation(receipt, {'level': level})
    anchor = {'mode':'individual', 'chainId':20260822, 'contract':receipt['context']['anchorContract'], 'transactionHash':'0x'+'ee'*32}
    create_presentation(receipt, {'level':'commitment-only'}, anchor)
    for field, value in [('chainId', 1), ('chainId', True), ('contract', '0x'+'cc'*20)]:
        with pytest.raises(ValueError, match='context'):
            create_presentation(receipt, {'level':'commitment-only'}, {**anchor, field:value})
    summary = assurance_summary(create_presentation(receipt, {'level':'commitment-only'}))
    assert summary['profileValidation'] == 'not-checked'
    assert summary['signatureVerification'] == 'not-checked'


def test_published_schemas_accept_vectors():
    from jsonschema import Draft202012Validator
    schema_dir = ROOT / 'spec/verification-receipt'
    receipt_schema = json.loads((schema_dir / 'verification-receipt-v0.4.0-alpha.schema.json').read_text())
    profile_schema = json.loads((schema_dir / 'profile-v0.4.0-alpha.schema.json').read_text())
    for fixture in FIXTURES:
        Draft202012Validator(receipt_schema).validate(fixture['receipt'])
        Draft202012Validator(profile_schema).validate(fixture['profile'])
