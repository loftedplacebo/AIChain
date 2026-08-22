package kawpowverifier

import (
	"bytes"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

func TestBoundaryFromDifficultyMatchesEthashTargetConvention(t *testing.T) {
	boundary, err := boundaryFromDifficulty(big.NewInt(1))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(boundary[:], bytes.Repeat([]byte{0xff}, 32)) {
		t.Fatalf("difficulty one boundary = %x", boundary)
	}

	boundary, err = boundaryFromDifficulty(big.NewInt(2))
	if err != nil {
		t.Fatal(err)
	}
	if boundary[0] != 0x80 || !bytes.Equal(boundary[1:], make([]byte, 31)) {
		t.Fatalf("difficulty two boundary = %x", boundary)
	}
}

func TestSealFromCoreGethHeaderMapsToC1Verifier(t *testing.T) {
	ResetEpochCacheForTest()
	header := &types.Header{
		ParentHash: common.HexToHash("0x010203"),
		Number:     big.NewInt(0),
		Difficulty: big.NewInt(1),
		GasLimit:   30_000_000,
		Time:       1,
	}

	initial, err := SealFromCoreGethHeader(header)
	if err != nil {
		t.Fatal(err)
	}
	mix, final, err := Hash(initial.BlockNumber, initial.HeaderHash, initial.Nonce)
	if err != nil {
		t.Fatal(err)
	}
	header.MixDigest = common.Hash(mix)

	mapped, err := SealFromCoreGethHeader(header)
	if err != nil {
		t.Fatal(err)
	}
	if mapped.HeaderHash != initial.HeaderHash {
		t.Fatal("seal hash changed after setting mix digest")
	}
	if mapped.MixHash != mix {
		t.Fatalf("mix digest mapping = %x, expected %x", mapped.MixHash, mix)
	}
	if mapped.Boundary != initial.Boundary {
		t.Fatal("difficulty boundary changed unexpectedly")
	}
	valid, err := Verify(mapped)
	if err != nil || !valid {
		t.Fatalf("mapped Core-Geth header was not valid: valid=%t err=%v final=%x", valid, err, final)
	}
}

func TestSealFromCoreGethHeaderRejectsInvalidInputs(t *testing.T) {
	if _, err := SealFromCoreGethHeader(nil); err == nil {
		t.Fatal("nil header was accepted")
	}
	if _, err := SealFromCoreGethHeader(&types.Header{Number: big.NewInt(0), Difficulty: big.NewInt(0)}); err == nil {
		t.Fatal("zero difficulty was accepted")
	}
}
