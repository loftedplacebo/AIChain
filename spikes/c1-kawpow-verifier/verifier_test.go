package kawpowverifier

import (
	"encoding/hex"
	"sync"
	"testing"
)

func mustHash(t *testing.T, value string) [32]byte {
	t.Helper()
	var out [32]byte
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != len(out) {
		t.Fatalf("invalid fixture %q: %v", value, err)
	}
	copy(out[:], decoded)
	return out
}

func TestPinnedProgPowVectorZero(t *testing.T) {
	ResetEpochCacheForTest()
	var header [32]byte
	expectedMix := mustHash(t, "6e97b47b134fda0c7888802988e1a373affeb28bcd813b6e9a0fc669c935d03a")
	expectedFinal := mustHash(t, "e601a7257a70dc48fccc97a7330d704d776047623b92883d77111fb36870f3d1")

	mix, final, err := Hash(0, header, 0)
	if err != nil {
		t.Fatal(err)
	}
	if mix != expectedMix || final != expectedFinal {
		t.Fatalf("unexpected C1 output: mix=%x final=%x", mix, final)
	}

	valid, err := Verify(Seal{BlockNumber: 0, HeaderHash: header, MixHash: mix, Nonce: 0, Boundary: final})
	if err != nil || !valid {
		t.Fatalf("expected valid seal, valid=%t err=%v", valid, err)
	}

	mix[0]++
	valid, err = Verify(Seal{BlockNumber: 0, HeaderHash: header, MixHash: mix, Nonce: 0, Boundary: final})
	if err != nil {
		t.Fatal(err)
	}
	if valid {
		t.Fatal("accepted a tampered mix hash")
	}
}

func TestEpochCacheReusesCurrentEpochAndRotates(t *testing.T) {
	ResetEpochCacheForTest()
	var header [32]byte
	if _, _, err := Hash(0, header, 0); err != nil {
		t.Fatal(err)
	}
	if builds := EpochCacheBuildCount(); builds != 1 {
		t.Fatalf("expected one epoch build after first hash, got %d", builds)
	}
	if _, _, err := Hash(1, header, 1); err != nil {
		t.Fatal(err)
	}
	if builds := EpochCacheBuildCount(); builds != 1 {
		t.Fatalf("expected same epoch to be reused, got %d builds", builds)
	}
	if _, _, err := Hash(7500, header, 2); err != nil {
		t.Fatal(err)
	}
	if builds := EpochCacheBuildCount(); builds != 2 {
		t.Fatalf("expected epoch change to rebuild context, got %d builds", builds)
	}
}

func TestRejectsNegativeBlockNumber(t *testing.T) {
	valid, err := Verify(Seal{BlockNumber: -1})
	if err == nil || valid {
		t.Fatalf("negative block number: valid=%t err=%v", valid, err)
	}
}

func TestHashRejectsNegativeBlockNumber(t *testing.T) {
	_, _, err := Hash(-1, [32]byte{}, 0)
	if err == nil {
		t.Fatal("expected negative block number to be rejected")
	}
}

func TestEpochCacheConcurrentHashAndVerify(t *testing.T) {
	ResetEpochCacheForTest()
	var header [32]byte
	var workers sync.WaitGroup
	for worker := 0; worker < 12; worker++ {
		workers.Add(1)
		go func(worker int) {
			defer workers.Done()
			for iteration := 0; iteration < 2; iteration++ {
				block := 0
				if (worker+iteration)%2 == 1 {
					block = 7500
				}
				mix, final, err := Hash(block, header, uint64(worker*10+iteration))
				if err != nil {
					t.Errorf("hash worker %d: %v", worker, err)
					return
				}
				valid, err := Verify(Seal{BlockNumber: block, HeaderHash: header, MixHash: mix, Nonce: uint64(worker*10 + iteration), Boundary: final})
				if err != nil || !valid {
					t.Errorf("verify worker %d: valid=%t err=%v", worker, valid, err)
					return
				}
			}
		}(worker)
	}
	workers.Wait()
}
