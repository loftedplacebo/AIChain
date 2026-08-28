package zkpolicystatement

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const statementVersion = "0.1.0-draft"
const receiptVersion = "0.2.0-draft"
const ruleSet = "aichain.policy.allowlist-v1"

type Action struct { Operation string `json:"operation"`; Resource string `json:"resource"`; Amount uint64 `json:"amount"` }
type Configuration struct { EnforceAmount bool `json:"enforceAmount"`; EnforceResource bool `json:"enforceResource"` }
type Policy struct { AllowedOperations []string `json:"allowedOperations"`; AllowedResources []string `json:"allowedResources"`; MaxAmount uint64 `json:"maxAmount"` }
type Blindings struct { Input string `json:"input"`; Output string `json:"output"`; Configuration string `json:"configuration"`; Policy string `json:"policy"` }
type Witness struct { Action Action `json:"action"`; Configuration Configuration `json:"configuration"`; Policy Policy `json:"policy"`; Blindings Blindings `json:"blindings"`; ModelCommitment string `json:"modelCommitment"`; ProviderCommitment string `json:"providerCommitment"` }
type Metadata struct { Issuer string `json:"issuer"`; OrganizationID string `json:"organizationId"`; AuthorityCommitment string `json:"authorityCommitment"`; ClaimedAtEpochSeconds int64 `json:"claimedAtEpochSeconds"` }
type Public struct { AuthorityCommitment string `json:"authorityCommitment"`; ClaimedAtEpochSeconds int64 `json:"claimedAtEpochSeconds"`; CommitmentsRoot string `json:"commitmentsRoot"`; Decision string `json:"decision"`; Issuer string `json:"issuer"`; OrganizationID string `json:"organizationId"`; ProgramCommitment string `json:"programCommitment"`; ReceiptID string `json:"receiptId"`; ResultCommitment string `json:"resultCommitment"`; StatementID string `json:"statementId"` }
type Document struct { StatementVersion string `json:"statementVersion"`; PublicMetadata Metadata `json:"publicMetadata"`; PrivateWitness Witness `json:"privateWitness"`; ExpectedPublic Public `json:"expectedPublic"` }

func hash(parts ...[]byte) string { h := sha256.New(); for _, part := range parts { _, _ = h.Write(part) }; return "0x" + hex.EncodeToString(h.Sum(nil)) }
func canonical(value any) []byte { data, err := json.Marshal(value); if err != nil { panic(err) }; return data }
func bytes32(value string) bool { if len(value) != 66 || !strings.HasPrefix(value, "0x") || value != strings.ToLower(value) { return false }; _, err := hex.DecodeString(value[2:]); return err == nil }
func sortedUnique(values []string) bool { if len(values) == 0 { return false }; clone := append([]string(nil), values...); sort.Strings(clone); for i := range values { if values[i] == "" || values[i] != clone[i] || (i > 0 && values[i] == values[i-1]) { return false } }; return true }

func validate(w Witness) error {
	if w.Action.Operation == "" || w.Action.Resource == "" { return errors.New("action strings must be non-empty") }
	if w.Action.Amount >= 1<<63 || w.Policy.MaxAmount >= 1<<63 { return errors.New("amounts must be unsigned 63-bit integers") }
	if !sortedUnique(w.Policy.AllowedOperations) || !sortedUnique(w.Policy.AllowedResources) { return errors.New("allowlists must be sorted, unique and non-empty") }
	for _, value := range []string{w.Blindings.Input, w.Blindings.Output, w.Blindings.Configuration, w.Blindings.Policy, w.ModelCommitment, w.ProviderCommitment} { if !bytes32(value) { return errors.New("commitments and blindings must be lowercase bytes32") } }
	return nil
}

func Evaluate(w Witness) (map[string]any, error) {
	if err := validate(w); err != nil { return nil, err }
	reasons := []string{}
	contains := func(values []string, target string) bool { for _, value := range values { if value == target { return true } }; return false }
	if !contains(w.Policy.AllowedOperations, w.Action.Operation) { reasons = append(reasons, "operation-not-allowed") }
	if w.Configuration.EnforceResource && !contains(w.Policy.AllowedResources, w.Action.Resource) { reasons = append(reasons, "resource-not-allowed") }
	if w.Configuration.EnforceAmount && w.Action.Amount > w.Policy.MaxAmount { reasons = append(reasons, "amount-exceeds-limit") }
	decision := "allow"; if len(reasons) > 0 { decision = "deny" }
	return map[string]any{"decision": decision, "reasonCodes": reasons, "ruleSet": ruleSet}, nil
}

func blinded(kind string, value any, blinding string) string { raw, _ := hex.DecodeString(blinding[2:]); return hash([]byte(fmt.Sprintf("aichain:zk-witness:%s:%s:", statementVersion, kind)), raw, canonical(value)) }

func DerivePublic(metadata Metadata, witness Witness) (Public, error) {
	if err := validate(witness); err != nil { return Public{}, err }
	if !bytes32(metadata.OrganizationID) || !bytes32(metadata.AuthorityCommitment) || metadata.ClaimedAtEpochSeconds < 0 { return Public{}, errors.New("invalid public metadata") }
	result, _ := Evaluate(witness)
	action := map[string]any{"amount": witness.Action.Amount, "operation": witness.Action.Operation, "resource": witness.Action.Resource}
	configuration := map[string]any{"enforceAmount": witness.Configuration.EnforceAmount, "enforceResource": witness.Configuration.EnforceResource}
	policy := map[string]any{"allowedOperations": witness.Policy.AllowedOperations, "allowedResources": witness.Policy.AllowedResources, "maxAmount": witness.Policy.MaxAmount}
	commitments := map[string]any{"configuration": blinded("configuration", configuration, witness.Blindings.Configuration), "input": blinded("input", action, witness.Blindings.Input), "model": witness.ModelCommitment, "output": blinded("output", result, witness.Blindings.Output), "policy": blinded("policy", policy, witness.Blindings.Policy), "provider": witness.ProviderCommitment}
	commitmentsRoot := hash([]byte("aichain:authorised-avr:commitments:"+receiptVersion+":"), canonical(commitments))
	issuer := strings.ToLower(metadata.Issuer)
	receipt := map[string]any{"assuranceLevel": "organisation-authorised", "commitments": commitments, "execution": map[string]any{"claimedAt": time.Unix(metadata.ClaimedAtEpochSeconds, 0).UTC().Format("2006-01-02T15:04:05Z")}, "identity": map[string]any{"authorityCommitment": metadata.AuthorityCommitment, "organizationId": metadata.OrganizationID}, "issuer": issuer, "schema": "aichain.authorised-avr", "schemaVersion": receiptVersion}
	return Public{metadata.AuthorityCommitment, metadata.ClaimedAtEpochSeconds, commitmentsRoot, result["decision"].(string), issuer, metadata.OrganizationID, hash([]byte("aichain:zk-program:policy-evaluation:allowlist-v1")), hash([]byte("aichain:authorised-avr:"+receiptVersion+":"), canonical(receipt)), commitments["output"].(string), hash([]byte("aichain:zk-statement:policy-evaluation:0.1.0-draft"))}, nil
}
