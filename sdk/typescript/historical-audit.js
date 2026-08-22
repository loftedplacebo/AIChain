// Pure verification report builder for the development historical-authorisation profile.

function equalHex(left, right) {
  return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}

function buildHistoricalAuditReport({ prepared, anchor, authorisedAtInclusion, credential = null }) {
  const result = {
    receiptId: prepared.receiptId,
    schemaVersion: prepared.schemaVersion,
    anchor: {
      organizationIdMatches: equalHex(anchor.organizationId, prepared.organizationId),
      authorityCommitmentMatches: equalHex(anchor.authorityCommitment, prepared.authorityCommitment),
      commitmentsRootMatches: equalHex(anchor.commitmentsRoot, prepared.commitmentsRoot),
      issuerMatches: equalHex(anchor.issuer, prepared.issuer),
      schemaVersionMatches: anchor.schemaVersion === prepared.schemaVersion,
      authorisationCheckedAt: Number(anchor.authorisationCheckedAt),
    },
    historicalAuthorisationAtInclusion: authorisedAtInclusion,
    credential: credential ?? { checked: false },
  };
  result.valid = result.anchor.organizationIdMatches
    && result.anchor.authorityCommitmentMatches
    && result.anchor.commitmentsRootMatches
    && result.anchor.issuerMatches
    && result.anchor.schemaVersionMatches
    && result.historicalAuthorisationAtInclusion
    && (result.credential.checked === false || result.credential.valid === true);
  return result;
}

module.exports = { buildHistoricalAuditReport };

