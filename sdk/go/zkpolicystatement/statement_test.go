package zkpolicystatement

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func fixture(t *testing.T) Document {
	t.Helper()
	data, err := os.ReadFile("../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json")
	if err != nil {
		t.Fatal(err)
	}
	var d Document
	if err := json.Unmarshal(data, &d); err != nil {
		t.Fatal(err)
	}
	return d
}

func TestGoldenVector(t *testing.T) {
	d := fixture(t)
	got, err := DerivePublic(d.PublicMetadata, d.PrivateWitness)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, d.ExpectedPublic) {
		t.Fatalf("public inputs mismatch\n got: %#v\nwant: %#v", got, d.ExpectedPublic)
	}
}

func TestTamperingChangesBindings(t *testing.T) {
	d := fixture(t)
	d.PrivateWitness.Action.Amount = 1001
	got, err := DerivePublic(d.PublicMetadata, d.PrivateWitness)
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(got, d.ExpectedPublic) {
		t.Fatal("tampered witness unexpectedly matched")
	}
	result, _ := Evaluate(d.PrivateWitness)
	if result["decision"] != "deny" {
		t.Fatal("expected deny")
	}
}

func TestInvalidAllowlistRejected(t *testing.T) {
	d := fixture(t)
	d.PrivateWitness.Policy.AllowedOperations = []string{"transfer", "approve"}
	if _, err := DerivePublic(d.PublicMetadata, d.PrivateWitness); err == nil {
		t.Fatal("unsorted allowlist accepted")
	}
}
