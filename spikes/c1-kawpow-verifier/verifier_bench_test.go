package kawpowverifier

import "testing"

func benchmarkFixture(b *testing.B) (Seal, [32]byte) {
	b.Helper()
	var header [32]byte
	mix, final, err := Hash(0, header, 0)
	if err != nil {
		b.Fatal(err)
	}
	return Seal{BlockNumber: 0, HeaderHash: header, MixHash: mix, Nonce: 0, Boundary: final}, final
}

// BenchmarkHashIncludesEpochSetup records the current isolated adapter's
// conservative cost. The eventual consensus engine must cache epoch contexts;
// this result must not be presented as its final validation cost.
func BenchmarkHashIncludesEpochSetup(b *testing.B) {
	var header [32]byte
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, _, err := Hash(0, header, uint64(i)); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkVerifyIncludesEpochSetup has the same conservative caveat as Hash.
func BenchmarkVerifyIncludesEpochSetup(b *testing.B) {
	seal, _ := benchmarkFixture(b)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		valid, err := Verify(seal)
		if err != nil || !valid {
			b.Fatalf("valid=%t err=%v", valid, err)
		}
	}
}
