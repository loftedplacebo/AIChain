// Package authorisedreceipt implements the development-only AVR 0.2.0-draft identifier vector.
package authorisedreceipt

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
)

const receiptDomain = "aichain:authorised-avr:0.2.0-draft:"
const commitmentsDomain = "aichain:authorised-avr:commitments:0.2.0-draft:"

type Derived struct { ReceiptID string; CommitmentsRoot string }

func hash(domain string, canonical []byte) string {
	sum := sha256.Sum256(append([]byte(domain), canonical...))
	return "0x" + hex.EncodeToString(sum[:])
}

// Derive uses encoding/json's deterministic sorted-map encoding to match the shared vector.
func Derive(raw []byte) (Derived, error) {
	var receipt map[string]any
	if err := json.Unmarshal(raw, &receipt); err != nil { return Derived{}, err }
	if receipt["schema"] != "aichain.authorised-avr" || receipt["schemaVersion"] != "0.2.0-draft" { return Derived{}, errors.New("unsupported authorised AVR schema") }
	if receipt["assuranceLevel"] != "organisation-authorised" { return Derived{}, errors.New("unexpected assurance level") }
	commitments, ok := receipt["commitments"].(map[string]any)
	if !ok || len(commitments) != 6 { return Derived{}, errors.New("invalid commitments object") }
	canonicalReceipt, err := json.Marshal(receipt); if err != nil { return Derived{}, err }
	canonicalCommitments, err := json.Marshal(commitments); if err != nil { return Derived{}, err }
	return Derived{ReceiptID: hash(receiptDomain, canonicalReceipt), CommitmentsRoot: hash(commitmentsDomain, canonicalCommitments)}, nil
}

