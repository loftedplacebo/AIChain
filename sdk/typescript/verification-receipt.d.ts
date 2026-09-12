/** Alpha types. Runtime validators enforce canonical strings, sizes and profile requirements. */
export type Hex = `0x${string}`;
export type EvidenceRole = `${string}:${string}`;
export interface Commitment { scheme: 'sha256' | 'sha256-salted-v1'; digest: Hex; mediaType: string }
export interface ProfileDefinition {
  id: string; version: string; specificationDigest: Hex; subjectKinds: EvidenceRole[]; requiredEvidence: EvidenceRole[];
  requireStream: boolean; requireObservation: boolean;
}
export interface ProfileReference { id: string; version: string; digest: Hex }
export interface ReceiptFields {
  context: { chainId: string; anchorContract: Hex };
  issuer: Hex;
  subject: { kind: EvidenceRole; id: Hex };
  event: {
    id: Hex; type: EvidenceRole; claimedAt: string;
    observation?: { clock: 'utc' | 'monotonic' | 'simulation'; ticksNs: string; uncertaintyNs: string | null };
    stream?: { id: Hex; sequence: string; previousReceiptId: Hex | null };
  };
  commitments: Record<EvidenceRole, Commitment>;
  links?: { relation: EvidenceRole; receiptId: Hex }[];
}
export interface VerificationReceipt extends ReceiptFields {
  schema: 'aichain.verification-receipt'; schemaVersion: '0.4.0-alpha';
  profile: ProfileReference; links: { relation: EvidenceRole; receiptId: Hex }[];
}
export interface DerivedReceipt { canonicalReceipt: string; canonicalCommitments: string; receiptId: Hex; commitmentsRoot: Hex }
export const SCHEMA: 'aichain.verification-receipt';
export const VERSION: '0.4.0-alpha';
export const MAX_BYTES: number;
export function validateVerificationReceipt(receipt: unknown): asserts receipt is VerificationReceipt;
export function validateProfileDefinition(profile: unknown): asserts profile is ProfileDefinition;
export function profileReference(profile: ProfileDefinition): ProfileReference;
export function validateReceiptProfile(receipt: VerificationReceipt, profile: ProfileDefinition): { profileValidated: true; profileId: string; scope: string };
export function createVerificationReceipt(fields: ReceiptFields, profile: ProfileDefinition): VerificationReceipt;
export function deriveVerificationReceipt(receipt: VerificationReceipt): DerivedReceipt;
export function prepareVerificationAnchor(receipt: VerificationReceipt): { receiptId: Hex; commitmentsRoot: Hex; schemaVersion: string; claimedIssuer: Hex; chainId: string; anchorContract: Hex };
export function commitEvidence(bytes: Uint8Array, mediaType: string, salt?: Hex): { commitment: Commitment; salt: Hex };
export function commitEvidenceStream(chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, mediaType: string, salt?: Hex): Promise<{ commitment: Commitment; salt: Hex }>;
export function verifyEvidence(commitment: Commitment, bytes: Uint8Array, salt?: Hex | null): boolean;
export function prepareVerificationAttestation(receipt: VerificationReceipt): { scheme: 'eip191-personal-sign'; receiptId: Hex; issuer: Hex; message: string };
export function verifyVerificationAttestation(receipt: VerificationReceipt, signature: string): boolean;
export function verifyStreamLink(previous: VerificationReceipt, current: VerificationReceipt): boolean;
