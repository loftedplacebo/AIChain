// General, additive receipt envelope. Legacy AVR hashing is deliberately untouched.
const crypto = require('node:crypto');
const { canonicalize } = require('./receipt');

const SCHEMA = 'aichain.verification-receipt';
const VERSION = '0.4.0-alpha';
const DOMAIN = `aichain:verification-receipt:${VERSION}:`;
const HEX = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const NAME = /^[a-z][a-z0-9.-]*:[a-z][a-z0-9._-]*$/;
const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const MAX_BYTES = 12288; // Leaves space for presentation/signature/anchor in default ingress.

function requireValue(ok, message) { if (!ok) throw new Error(message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function shape(value, required, optional = []) {
  requireValue(object(value) && required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => [...required, ...optional].includes(k)), `Expected fields: ${required.join(', ')}`);
}
function string(value, pattern, max = 160) { requireValue(typeof value === 'string' && value.length <= max && pattern.exec(value)?.[0] === value, 'Invalid bounded string'); }
function digest(value) { string(value, HEX); }
function name(value) { string(value, NAME); }
function decimal(value) { string(value, DECIMAL, 78); }
function timestamp(value) {
  string(value, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/);
  requireValue(!value.startsWith('0000') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value, 'Invalid UTC timestamp');
}
function hash(domain, value) { return `0x${crypto.createHash('sha256').update(domain).update(value).digest('hex')}`; }
function descriptor(value) {
  shape(value, ['scheme', 'digest', 'mediaType']);
  requireValue(['sha256', 'sha256-salted-v1'].includes(value.scheme), 'Unsupported commitment scheme');
  digest(value.digest);
  string(value.mediaType, /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/, 128);
}

function validateVerificationReceipt(receipt) {
  shape(receipt, ['schema', 'schemaVersion', 'profile', 'context', 'issuer', 'subject', 'event', 'commitments', 'links']);
  requireValue(receipt.schema === SCHEMA && receipt.schemaVersion === VERSION, 'Unsupported verification receipt schema');
  shape(receipt.profile, ['id', 'version', 'digest']);
  string(receipt.profile.id, /^(urn:|https:\/\/)[!-~]+$/, 256);
  string(receipt.profile.version, /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/, 64);
  digest(receipt.profile.digest);
  shape(receipt.context, ['chainId', 'anchorContract']);
  decimal(receipt.context.chainId);
  requireValue(BigInt(receipt.context.chainId) > 0n && BigInt(receipt.context.chainId) < (1n << 256n), 'Invalid chain ID');
  string(receipt.context.anchorContract, ADDRESS);
  string(receipt.issuer, ADDRESS);
  requireValue(receipt.context.anchorContract !== `0x${'0'.repeat(40)}` && receipt.issuer !== `0x${'0'.repeat(40)}`, 'Zero address is not allowed');
  shape(receipt.subject, ['kind', 'id']); name(receipt.subject.kind); digest(receipt.subject.id);
  shape(receipt.event, ['id', 'type', 'claimedAt'], ['observation', 'stream']);
  digest(receipt.event.id); name(receipt.event.type); timestamp(receipt.event.claimedAt);
  if (Object.hasOwn(receipt.event, 'observation')) {
    const observation = receipt.event.observation;
    shape(observation, ['clock', 'ticksNs', 'uncertaintyNs']);
    requireValue(['utc', 'monotonic', 'simulation'].includes(observation.clock), 'Unsupported observation clock');
    decimal(observation.ticksNs);
    if (observation.uncertaintyNs !== null) decimal(observation.uncertaintyNs);
  }
  if (Object.hasOwn(receipt.event, 'stream')) {
    const stream = receipt.event.stream;
    shape(stream, ['id', 'sequence', 'previousReceiptId']); digest(stream.id); decimal(stream.sequence);
    if (stream.sequence === '0') requireValue(stream.previousReceiptId === null, 'First stream receipt must have no predecessor');
    else digest(stream.previousReceiptId);
  }
  requireValue(object(receipt.commitments) && Object.keys(receipt.commitments).length >= 1 && Object.keys(receipt.commitments).length <= 32, 'Expected 1..32 evidence commitments');
  for (const [role, evidence] of Object.entries(receipt.commitments)) { name(role); descriptor(evidence); }
  requireValue(Array.isArray(receipt.links) && receipt.links.length <= 32, 'Expected at most 32 receipt links');
  for (const link of receipt.links) { shape(link, ['relation', 'receiptId']); name(link.relation); digest(link.receiptId); }
  requireValue(new Set(receipt.links.map(canonicalize)).size === receipt.links.length, 'Duplicate receipt links');
  requireValue(Buffer.byteLength(canonicalize(receipt), 'utf8') <= MAX_BYTES, 'Receipt exceeds byte limit');
}

function validateProfileDefinition(profile) {
  shape(profile, ['id', 'version', 'specificationDigest', 'subjectKinds', 'requiredEvidence', 'requireStream', 'requireObservation']);
  digest(profile.specificationDigest);
  string(profile.id, /^(urn:|https:\/\/)[!-~]+$/, 256);
  string(profile.version, /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/, 64);
  for (const field of ['subjectKinds', 'requiredEvidence']) {
    requireValue(Array.isArray(profile[field]) && profile[field].length <= 32 && new Set(profile[field]).size === profile[field].length, `Invalid ${field}`);
    profile[field].forEach(name);
  }
  requireValue(typeof profile.requireStream === 'boolean' && typeof profile.requireObservation === 'boolean', 'Profile requirements must be booleans');
}
function profileReference(profile) {
  validateProfileDefinition(profile);
  return { id: profile.id, version: profile.version, digest: hash(`${DOMAIN}profile:`, canonicalize(profile)) };
}
function validateReceiptProfile(receipt, profile) {
  validateVerificationReceipt(receipt);
  requireValue(canonicalize(receipt.profile) === canonicalize(profileReference(profile)), 'Profile definition does not match pinned reference');
  requireValue(!profile.subjectKinds.length || profile.subjectKinds.includes(receipt.subject.kind), 'Unsupported subject kind for profile');
  requireValue(profile.requiredEvidence.every(role => Object.hasOwn(receipt.commitments, role)), 'Required profile evidence is missing');
  requireValue(!profile.requireStream || Object.hasOwn(receipt.event, 'stream'), 'Profile requires stream continuity');
  requireValue(!profile.requireObservation || Object.hasOwn(receipt.event, 'observation'), 'Profile requires observation clock');
  return { profileValidated: true, profileId: profile.id, scope: 'Evidence shape only; evidence contents and claims are not appraised.' };
}
function createVerificationReceipt(fields, profile) {
  shape(fields, ['context', 'issuer', 'subject', 'event', 'commitments'], ['links']);
  const receipt = { schema: SCHEMA, schemaVersion: VERSION, ...fields, links: fields.links ?? [], profile: profileReference(profile) };
  validateReceiptProfile(receipt, profile);
  return JSON.parse(canonicalize(receipt));
}
function deriveVerificationReceipt(receipt) {
  validateVerificationReceipt(receipt);
  const canonicalReceipt = canonicalize(receipt);
  const canonicalCommitments = canonicalize(receipt.commitments);
  return { canonicalReceipt, canonicalCommitments, receiptId: hash(DOMAIN, canonicalReceipt), commitmentsRoot: hash(`${DOMAIN}commitments:`, canonicalCommitments) };
}
function prepareVerificationAnchor(receipt) {
  const { receiptId, commitmentsRoot } = deriveVerificationReceipt(receipt);
  return { receiptId, commitmentsRoot, schemaVersion: VERSION, claimedIssuer: receipt.issuer, ...receipt.context };
}

// Evidence is exact bytes, not implicitly reserialized JSON. Salt is private sidecar data.
function commitEvidence(bytes, mediaType, salt = `0x${crypto.randomBytes(32).toString('hex')}`) {
  requireValue(bytes instanceof Uint8Array, 'Evidence must be bytes');
  digest(salt);
  const evidence = { scheme: 'sha256-salted-v1', mediaType, digest: hash(`${DOMAIN}evidence:`, Buffer.concat([Buffer.from(salt.slice(2), 'hex'), Buffer.from(bytes)])) };
  descriptor(evidence);
  return { commitment: evidence, salt };
}
function verifyEvidence(commitment, bytes, salt = null) {
  descriptor(commitment);
  requireValue(bytes instanceof Uint8Array, 'Evidence must be bytes');
  if (commitment.scheme === 'sha256') return salt === null && hash('', bytes) === commitment.digest;
  digest(salt);
  return commitEvidence(bytes, commitment.mediaType, salt).commitment.digest === commitment.digest;
}
async function commitEvidenceStream(chunks, mediaType, salt = `0x${crypto.randomBytes(32).toString('hex')}`) {
  digest(salt);
  const evidence = { scheme: 'sha256-salted-v1', mediaType, digest: `0x${'0'.repeat(64)}` };
  descriptor(evidence);
  const hasher = crypto.createHash('sha256').update(`${DOMAIN}evidence:`).update(Buffer.from(salt.slice(2), 'hex'));
  for await (const chunk of chunks) { requireValue(chunk instanceof Uint8Array, 'Evidence chunks must be bytes'); hasher.update(chunk); }
  evidence.digest = `0x${hasher.digest('hex')}`;
  return { commitment: evidence, salt };
}
function prepareVerificationAttestation(receipt) {
  const { receiptId } = deriveVerificationReceipt(receipt);
  return { scheme: 'eip191-personal-sign', receiptId, issuer: receipt.issuer, message: `AIChain Verification Receipt ${VERSION}: ${receiptId}` };
}
function verifyVerificationAttestation(receipt, signature) {
  const prepared = prepareVerificationAttestation(receipt);
  try { return require('ethers').verifyMessage(prepared.message, signature).toLowerCase() === receipt.issuer; }
  catch { return false; }
}
function verifyStreamLink(previous, current) {
  const prior = deriveVerificationReceipt(previous); validateVerificationReceipt(current);
  const a = previous.event.stream, b = current.event.stream;
  return Boolean(a && b && canonicalize(previous.context) === canonicalize(current.context)
    && previous.issuer === current.issuer && canonicalize(previous.subject) === canonicalize(current.subject)
    && canonicalize(previous.profile) === canonicalize(current.profile) && a.id === b.id
    && BigInt(b.sequence) === BigInt(a.sequence) + 1n && b.previousReceiptId === prior.receiptId);
}

module.exports = { SCHEMA, VERSION, MAX_BYTES, validateVerificationReceipt, validateProfileDefinition, profileReference, validateReceiptProfile, createVerificationReceipt, deriveVerificationReceipt, prepareVerificationAnchor, commitEvidence, commitEvidenceStream, verifyEvidence, prepareVerificationAttestation, verifyVerificationAttestation, verifyStreamLink };
