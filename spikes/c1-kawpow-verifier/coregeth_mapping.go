package kawpowverifier

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/consensus/ethash"
	"github.com/ethereum/go-ethereum/core/types"
)

var (
	twoTo256 = new(big.Int).Lsh(big.NewInt(1), 256)
	maxHash  = new(big.Int).Sub(new(big.Int).Set(twoTo256), big.NewInt(1))
)

// SealFromCoreGethHeader maps only the PoW-relevant Core-Geth header fields
// into the isolated C1 verifier. It matches the existing Ethash convention of
// deriving a seal hash from the header without its nonce and mix digest, and
// converts the Ethash target (2^256 / difficulty) into the 256-bit boundary
// accepted by the C1 reference API.
//
// This establishes a mapping contract only. It does not make Core-Geth use
// KawPoW or assert that the algorithms' full protocol rules are interchangeable.
func SealFromCoreGethHeader(header *types.Header) (Seal, error) {
	if header == nil {
		return Seal{}, fmt.Errorf("header is required")
	}
	if header.Number == nil || header.Number.Sign() < 0 || !header.Number.IsInt64() {
		return Seal{}, fmt.Errorf("header number must be a non-negative signed 64-bit integer")
	}
	if header.Difficulty == nil || header.Difficulty.Sign() <= 0 {
		return Seal{}, fmt.Errorf("header difficulty must be positive")
	}

	sealHash := ethash.NewFaker().SealHash(header)
	boundary, err := boundaryFromDifficulty(header.Difficulty)
	if err != nil {
		return Seal{}, err
	}

	var seal Seal
	seal.BlockNumber = int(header.Number.Int64())
	copy(seal.HeaderHash[:], sealHash[:])
	copy(seal.MixHash[:], header.MixDigest[:])
	seal.Nonce = header.Nonce.Uint64()
	seal.Boundary = boundary
	return seal, nil
}

func boundaryFromDifficulty(difficulty *big.Int) ([32]byte, error) {
	var boundary [32]byte
	if difficulty == nil || difficulty.Sign() <= 0 {
		return boundary, fmt.Errorf("difficulty must be positive")
	}

	target := new(big.Int).Div(new(big.Int).Set(twoTo256), difficulty)
	// Core-Geth permits target == 2^256 at difficulty 1. C1 accepts a 256-bit
	// boundary, for which all ones has identical acceptance behaviour.
	if target.Cmp(maxHash) > 0 {
		target.Set(maxHash)
	}
	target.FillBytes(boundary[:])
	return boundary, nil
}
