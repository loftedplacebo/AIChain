use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

const STATEMENT_VERSION: &str = "0.1.0-draft";
const RECEIPT_VERSION: &str = "0.2.0-draft";
const RULE_SET: &str = "aichain.policy.allowlist-v1";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Action {
    pub operation: String,
    pub resource: String,
    pub amount: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Configuration {
    #[serde(rename = "enforceAmount")]
    pub enforce_amount: bool,
    #[serde(rename = "enforceResource")]
    pub enforce_resource: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Policy {
    #[serde(rename = "allowedOperations")]
    pub allowed_operations: Vec<String>,
    #[serde(rename = "allowedResources")]
    pub allowed_resources: Vec<String>,
    #[serde(rename = "maxAmount")]
    pub max_amount: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Blindings {
    pub input: String,
    pub output: String,
    pub configuration: String,
    pub policy: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Witness {
    pub action: Action,
    pub configuration: Configuration,
    pub policy: Policy,
    pub blindings: Blindings,
    #[serde(rename = "modelCommitment")]
    pub model_commitment: String,
    #[serde(rename = "providerCommitment")]
    pub provider_commitment: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Metadata {
    pub issuer: String,
    #[serde(rename = "organizationId")]
    pub organization_id: String,
    #[serde(rename = "authorityCommitment")]
    pub authority_commitment: String,
    #[serde(rename = "claimedAtEpochSeconds")]
    pub claimed_at_epoch_seconds: i64,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct PublicValues {
    #[serde(rename = "authorityCommitment")]
    pub authority_commitment: String,
    #[serde(rename = "claimedAtEpochSeconds")]
    pub claimed_at_epoch_seconds: i64,
    #[serde(rename = "commitmentsRoot")]
    pub commitments_root: String,
    pub decision: String,
    pub issuer: String,
    #[serde(rename = "organizationId")]
    pub organization_id: String,
    #[serde(rename = "programCommitment")]
    pub program_commitment: String,
    #[serde(rename = "receiptId")]
    pub receipt_id: String,
    #[serde(rename = "resultCommitment")]
    pub result_commitment: String,
    #[serde(rename = "statementId")]
    pub statement_id: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Input {
    #[serde(rename = "publicMetadata")]
    pub public_metadata: Metadata,
    #[serde(rename = "privateWitness")]
    pub private_witness: Witness,
    #[serde(rename = "expectedPublic")]
    pub expected_public: PublicValues,
}

fn canonical<T: Serialize>(value: &T) -> Vec<u8> {
    serde_json::to_vec(value).expect("canonical JSON")
}
fn hash(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    format!("0x{}", hex::encode(hasher.finalize()))
}
fn bytes32(value: &str) -> Result<Vec<u8>, String> {
    if value.len() != 66 || !value.starts_with("0x") || value != value.to_lowercase() {
        return Err("expected lowercase bytes32".into());
    };
    hex::decode(&value[2..]).map_err(|_| "invalid bytes32".into())
}
fn sorted_unique(values: &[String]) -> bool {
    !values.is_empty()
        && values
            .windows(2)
            .all(|pair| !pair[0].is_empty() && pair[0] < pair[1])
        && values.last().is_some_and(|v| !v.is_empty())
}
fn map(entries: Vec<(&str, Value)>) -> BTreeMap<String, Value> {
    entries
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect()
}

pub fn evaluate(witness: &Witness) -> Result<Value, String> {
    if witness.action.operation.is_empty()
        || witness.action.resource.is_empty()
        || witness.action.amount >= (1 << 63)
        || witness.policy.max_amount >= (1 << 63)
    {
        return Err("invalid action or amount".into());
    }
    if !sorted_unique(&witness.policy.allowed_operations)
        || !sorted_unique(&witness.policy.allowed_resources)
    {
        return Err("allowlists must be sorted, unique and non-empty".into());
    }
    for commitment in [
        &witness.blindings.input,
        &witness.blindings.output,
        &witness.blindings.configuration,
        &witness.blindings.policy,
        &witness.model_commitment,
        &witness.provider_commitment,
    ] {
        bytes32(commitment)?;
    }
    let mut reasons = Vec::new();
    if !witness
        .policy
        .allowed_operations
        .contains(&witness.action.operation)
    {
        reasons.push("operation-not-allowed");
    }
    if witness.configuration.enforce_resource
        && !witness
            .policy
            .allowed_resources
            .contains(&witness.action.resource)
    {
        reasons.push("resource-not-allowed");
    }
    if witness.configuration.enforce_amount && witness.action.amount > witness.policy.max_amount {
        reasons.push("amount-exceeds-limit");
    }
    Ok(
        json!({"decision": if reasons.is_empty() { "allow" } else { "deny" }, "reasonCodes": reasons, "ruleSet": RULE_SET}),
    )
}

fn blinded(kind: &str, value: &Value, blinding: &str) -> Result<String, String> {
    let raw = bytes32(blinding)?;
    Ok(hash(&[
        format!("aichain:zk-witness:{STATEMENT_VERSION}:{kind}:").as_bytes(),
        &raw,
        &canonical(value),
    ]))
}

fn claimed_at(epoch: i64) -> String {
    let days = epoch.div_euclid(86_400);
    let seconds = epoch.rem_euclid(86_400);
    // Civil date from days since 1970-01-01; integer-only and guest-compatible.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        seconds / 3600,
        (seconds % 3600) / 60,
        seconds % 60
    )
}

pub fn derive_public(metadata: &Metadata, witness: &Witness) -> Result<PublicValues, String> {
    if metadata.claimed_at_epoch_seconds < 0 {
        return Err("invalid timestamp".into());
    }
    bytes32(&metadata.organization_id)?;
    bytes32(&metadata.authority_commitment)?;
    let issuer = metadata.issuer.to_lowercase();
    let result = evaluate(witness)?;
    let action = json!({"amount": witness.action.amount, "operation": witness.action.operation, "resource": witness.action.resource});
    let configuration = json!({"enforceAmount": witness.configuration.enforce_amount, "enforceResource": witness.configuration.enforce_resource});
    let policy = json!({"allowedOperations": witness.policy.allowed_operations, "allowedResources": witness.policy.allowed_resources, "maxAmount": witness.policy.max_amount});
    let commitments = map(vec![
        (
            "configuration",
            Value::String(blinded(
                "configuration",
                &configuration,
                &witness.blindings.configuration,
            )?),
        ),
        (
            "input",
            Value::String(blinded("input", &action, &witness.blindings.input)?),
        ),
        ("model", Value::String(witness.model_commitment.clone())),
        (
            "output",
            Value::String(blinded("output", &result, &witness.blindings.output)?),
        ),
        (
            "policy",
            Value::String(blinded("policy", &policy, &witness.blindings.policy)?),
        ),
        (
            "provider",
            Value::String(witness.provider_commitment.clone()),
        ),
    ]);
    let commitments_root = hash(&[
        format!("aichain:authorised-avr:commitments:{RECEIPT_VERSION}:").as_bytes(),
        &canonical(&commitments),
    ]);
    let receipt = map(vec![
        ("assuranceLevel", json!("organisation-authorised")),
        ("commitments", json!(commitments)),
        (
            "execution",
            json!({"claimedAt": claimed_at(metadata.claimed_at_epoch_seconds)}),
        ),
        (
            "identity",
            json!({"authorityCommitment": metadata.authority_commitment, "organizationId": metadata.organization_id}),
        ),
        ("issuer", json!(issuer)),
        ("schema", json!("aichain.authorised-avr")),
        ("schemaVersion", json!(RECEIPT_VERSION)),
    ]);
    let receipt_id = hash(&[
        format!("aichain:authorised-avr:{RECEIPT_VERSION}:").as_bytes(),
        &canonical(&receipt),
    ]);
    let decision = result["decision"].as_str().expect("decision").to_string();
    Ok(PublicValues {
        authority_commitment: metadata.authority_commitment.clone(),
        claimed_at_epoch_seconds: metadata.claimed_at_epoch_seconds,
        commitments_root,
        decision,
        issuer,
        organization_id: metadata.organization_id.clone(),
        program_commitment: hash(&[b"aichain:zk-program:policy-evaluation:allowlist-v1"]),
        receipt_id,
        result_commitment: commitments["output"].as_str().expect("output").to_string(),
        statement_id: hash(&[b"aichain:zk-statement:policy-evaluation:0.1.0-draft"]),
    })
}

pub fn verify(input: &Input) -> Result<PublicValues, String> {
    let derived = derive_public(&input.public_metadata, &input.private_witness)?;
    if derived != input.expected_public {
        return Err("derived public values differ from supplied bindings".into());
    };
    Ok(derived)
}

#[cfg(test)]
mod tests {
    use super::{verify, Input};

    const FIXTURE: &str =
        include_str!("../../../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json");

    #[test]
    fn matches_the_cross_language_golden_vector() {
        let input: Input = serde_json::from_str(FIXTURE).expect("fixture");
        assert_eq!(
            verify(&input).expect("valid fixture"),
            input.expected_public
        );
    }

    #[test]
    fn rejects_a_tampered_private_action() {
        let mut input: Input = serde_json::from_str(FIXTURE).expect("fixture");
        input.private_witness.action.amount = 1001;
        assert!(verify(&input).is_err());
    }
}
