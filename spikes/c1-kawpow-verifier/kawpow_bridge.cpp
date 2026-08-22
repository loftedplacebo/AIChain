#include <ethash/ethash.hpp>
#include <ethash/progpow.hpp>

#include <cstdint>
#include <cstring>
#include <mutex>

namespace {

// A one-epoch cache is deliberately conservative for this spike. It bounds
// retained memory and demonstrates the cache boundary a Core-Geth engine will
// need; it is not the final production cache policy.
std::mutex epoch_mutex;
int cached_epoch = -1;
ethash::epoch_context_ptr cached_context{nullptr, ethash_destroy_epoch_context};
uint64_t epoch_build_count = 0;

const ethash::epoch_context* get_epoch_context(int block_number) {
    const auto epoch = ethash::get_epoch_number(block_number);
    if (!cached_context || cached_epoch != epoch) {
        cached_context = ethash::create_epoch_context(epoch);
        if (!cached_context) return nullptr;
        cached_epoch = epoch;
        ++epoch_build_count;
    }
    return cached_context.get();
}

}  // namespace

extern "C" int aichain_kawpow_hash(
    int block_number,
    const uint8_t header_hash[32],
    uint64_t nonce,
    uint8_t mix_hash_out[32],
    uint8_t final_hash_out[32]) {
    std::lock_guard<std::mutex> lock{epoch_mutex};
    const auto* context = get_epoch_context(block_number);
    if (!context) return 0;

    const auto header = ethash::hash256_from_bytes(header_hash);
    const auto result = progpow::hash(*context, block_number, header, nonce);
    std::memcpy(mix_hash_out, result.mix_hash.bytes, 32);
    std::memcpy(final_hash_out, result.final_hash.bytes, 32);
    return 1;
}

extern "C" int aichain_kawpow_verify(
    int block_number,
    const uint8_t header_hash[32],
    const uint8_t mix_hash[32],
    uint64_t nonce,
    const uint8_t boundary[32]) {
    std::lock_guard<std::mutex> lock{epoch_mutex};
    const auto* context = get_epoch_context(block_number);
    if (!context) return 0;

    return progpow::verify(
               *context,
               block_number,
               ethash::hash256_from_bytes(header_hash),
               ethash::hash256_from_bytes(mix_hash),
               nonce,
               ethash::hash256_from_bytes(boundary))
        ? 1
        : 0;
}

extern "C" void aichain_kawpow_reset_epoch_cache(void) {
    std::lock_guard<std::mutex> lock{epoch_mutex};
    cached_context.reset();
    cached_epoch = -1;
    epoch_build_count = 0;
}

extern "C" uint64_t aichain_kawpow_epoch_cache_build_count(void) {
    std::lock_guard<std::mutex> lock{epoch_mutex};
    return epoch_build_count;
}
