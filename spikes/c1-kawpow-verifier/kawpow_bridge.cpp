#include <ethash/ethash.hpp>
#include <ethash/progpow.hpp>

#include <cstdint>
#include <cstring>

extern "C" int aichain_kawpow_hash(
    int block_number,
    const uint8_t header_hash[32],
    uint64_t nonce,
    uint8_t mix_hash_out[32],
    uint8_t final_hash_out[32]) {
    const auto epoch = ethash::get_epoch_number(block_number);
    auto context = ethash::create_epoch_context(epoch);
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
    const auto epoch = ethash::get_epoch_number(block_number);
    auto context = ethash::create_epoch_context(epoch);
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
