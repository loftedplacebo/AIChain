// Development-only private organisation-control-plane helpers.

import { verifyMembership } from "./organisational-ledger.js";

export const ORGANISATION_VIEW_SCHEMA = "aichain.organisation-view";
export const ORGANISATION_VIEW_VERSION = "0.1.0-draft";
export const DISCLOSURE_SCHEMA = "aichain.ovl-disclosure-package";
export const DISCLOSURE_VERSION = "0.1.0-draft";

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function requireString(value, name) {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required`);
  return value;
}

export function buildOrganisationView(snapshot) {
  if (!snapshot || snapshot.schema !== ORGANISATION_VIEW_SCHEMA || snapshot.schemaVersion !== ORGANISATION_VIEW_VERSION) {
    throw new Error("Unsupported organisation-view schema");
  }
  const organisation = snapshot.organisation ?? {};
  const agents = requireArray(snapshot.agents, "agents");
  const policies = requireArray(snapshot.policies, "policies");
  const configurations = requireArray(snapshot.configurations, "configurations");
  const checkpoints = requireArray(snapshot.checkpoints, "checkpoints");
  requireString(organisation.ref, "organisation.ref");
  requireString(organisation.ledgerId, "organisation.ledgerId");
  const activeAgents = agents.filter((agent) => agent.status === "active").length;
  const activePolicies = policies.filter((policy) => policy.status === "active").length;
  const activeConfigurations = configurations.filter((configuration) => configuration.status === "active").length;
  const anchoredCheckpoints = checkpoints.filter((checkpoint) => checkpoint.anchor?.transactionHash).length;
  const lastCheckpoint = [...checkpoints].sort((left, right) => right.epoch - left.epoch)[0] ?? null;
  return {
    schema: ORGANISATION_VIEW_SCHEMA,
    schemaVersion: ORGANISATION_VIEW_VERSION,
    organisation: { ref: organisation.ref, ledgerId: organisation.ledgerId, displayName: organisation.displayName ?? "Private organisation" },
    inventory: {
      agents: { total: agents.length, active: activeAgents },
      policies: { total: policies.length, active: activePolicies },
      configurations: { total: configurations.length, active: activeConfigurations },
      checkpoints: { total: checkpoints.length, anchored: anchoredCheckpoints, last: lastCheckpoint },
    },
    records: { agents, policies, configurations, checkpoints },
  };
}

export function createDisclosurePackage({ checkpointPayload, evidenceReference, disclosedAt }) {
  const checkpoint = checkpointPayload?.checkpoint;
  const inclusionProof = checkpointPayload?.inclusionProof;
  if (!checkpoint || !inclusionProof) throw new Error("checkpointPayload must include checkpoint and inclusionProof");
  requireString(evidenceReference, "evidenceReference");
  requireString(disclosedAt, "disclosedAt");
  const membershipValid = verifyMembership(inclusionProof.receiptId, inclusionProof.siblings, checkpoint.receiptRoot);
  if (!membershipValid) throw new Error("Inclusion proof does not match checkpoint root");
  return {
    schema: DISCLOSURE_SCHEMA,
    schemaVersion: DISCLOSURE_VERSION,
    disclosedAt,
    receiptId: inclusionProof.receiptId,
    evidenceReference,
    checkpoint: {
      schema: checkpoint.schema,
      schemaVersion: checkpoint.schemaVersion,
      organisationRef: checkpoint.organisationRef,
      ledgerId: checkpoint.ledgerId,
      epoch: checkpoint.epoch,
      receiptRoot: checkpoint.receiptRoot,
      leafCount: checkpoint.leafCount,
      createdAt: checkpoint.createdAt,
    },
    inclusionProof: { leafIndex: inclusionProof.leafIndex, siblings: inclusionProof.siblings },
    verification: { localMembership: true, evidenceIncluded: false },
  };
}

