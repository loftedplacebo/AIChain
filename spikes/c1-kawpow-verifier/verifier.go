package kawpowverifier

/*
#cgo CFLAGS: -I${SRCDIR}/cpp-kawpow/include -I${SRCDIR}/cpp-kawpow/lib
#cgo CXXFLAGS: -std=c++11 -I${SRCDIR}/cpp-kawpow/include -I${SRCDIR}/cpp-kawpow/lib
#cgo LDFLAGS: -lstdc++
#include <stdint.h>

int aichain_kawpow_hash(
    int block_number,
    const uint8_t header_hash[32],
    uint64_t nonce,
    uint8_t mix_hash_out[32],
    uint8_t final_hash_out[32]);
int aichain_kawpow_verify(
    int block_number,
    const uint8_t header_hash[32],
    const uint8_t mix_hash[32],
    uint64_t nonce,
    const uint8_t boundary[32]);
void aichain_kawpow_reset_epoch_cache(void);
uint64_t aichain_kawpow_epoch_cache_build_count(void);
*/
import "C"

import (
	"fmt"
	"unsafe"
)

// Seal is the candidate-specific data a future Core-Geth engine would map
// from a header. It deliberately avoids importing Core-Geth in this spike.
type Seal struct {
	BlockNumber int
	HeaderHash  [32]byte
	MixHash     [32]byte
	Nonce       uint64
	Boundary    [32]byte
}

// Hash calculates the candidate-specific mix and final hashes on CPU.
func Hash(blockNumber int, headerHash [32]byte, nonce uint64) (mixHash, finalHash [32]byte, err error) {
	if blockNumber < 0 {
		return mixHash, finalHash, fmt.Errorf("block number must be non-negative")
	}
	ok := C.aichain_kawpow_hash(
		C.int(blockNumber),
		(*C.uint8_t)(unsafe.Pointer(&headerHash[0])),
		C.uint64_t(nonce),
		(*C.uint8_t)(unsafe.Pointer(&mixHash[0])),
		(*C.uint8_t)(unsafe.Pointer(&finalHash[0])),
	)
	if ok == 0 {
		return mixHash, finalHash, fmt.Errorf("could not create KawPoW epoch context")
	}
	return mixHash, finalHash, nil
}

// ResetEpochCacheForTest empties the development-only one-epoch cache. It is
// exposed solely for deterministic spike tests and must not define production
// Core-Geth cache behaviour.
func ResetEpochCacheForTest() {
	C.aichain_kawpow_reset_epoch_cache()
}

// EpochCacheBuildCount returns the development-only cache construction count.
func EpochCacheBuildCount() uint64 {
	return uint64(C.aichain_kawpow_epoch_cache_build_count())
}

// Verify checks a candidate seal on CPU. A GPU is never required by this path.
func Verify(seal Seal) (bool, error) {
	if seal.BlockNumber < 0 {
		return false, fmt.Errorf("block number must be non-negative")
	}
	return C.aichain_kawpow_verify(
		C.int(seal.BlockNumber),
		(*C.uint8_t)(unsafe.Pointer(&seal.HeaderHash[0])),
		(*C.uint8_t)(unsafe.Pointer(&seal.MixHash[0])),
		C.uint64_t(seal.Nonce),
		(*C.uint8_t)(unsafe.Pointer(&seal.Boundary[0])),
	) != 0, nil
}
