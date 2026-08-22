package authorisedreceipt

import ("os"; "path/filepath"; "testing")

func TestDeriveMatchesSharedAuthorisedReceiptVector(t *testing.T) {
	path := filepath.Join("..", "..", "..", "fixtures", "avr", "authorised-receipt-v0.2.0-draft.json")
	raw, err := os.ReadFile(path); if err != nil { t.Fatal(err) }
	derived, err := Derive(raw); if err != nil { t.Fatal(err) }
	const expectedReceiptID = "0x95fd56c532225dab2100b7c0c0e08fa48423f262a5b172e59dd332ea7733a61f"
	if derived.ReceiptID != expectedReceiptID { t.Fatalf("receipt ID = %s, want %s", derived.ReceiptID, expectedReceiptID) }
}

