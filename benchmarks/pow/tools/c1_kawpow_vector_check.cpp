// AIChain Phase 2A CPU-only conformance runner.
// It intentionally contains no KawPoW implementation: it compiles against a
// separately pinned Apache-2.0 cpp-kawpow checkout and exercises that
// checkout's published ProgPoW vectors.

#include <ethash/ethash.hpp>
#include <ethash/progpow.hpp>

#include "progpow_test_vectors.hpp"

#include <cstdint>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {

uint8_t fromHex(char c) {
    if (c >= '0' && c <= '9') return static_cast<uint8_t>(c - '0');
    if (c >= 'a' && c <= 'f') return static_cast<uint8_t>(c - 'a' + 10);
    if (c >= 'A' && c <= 'F') return static_cast<uint8_t>(c - 'A' + 10);
    throw std::runtime_error("invalid hex character");
}

ethash::hash256 parseHash256(const char* text) {
    ethash::hash256 hash{};
    const std::string value{text};
    if (value.size() != sizeof(hash.bytes) * 2) throw std::runtime_error("invalid hash length");
    for (size_t i = 0; i < sizeof(hash.bytes); ++i)
        hash.bytes[i] = static_cast<uint8_t>((fromHex(value[2 * i]) << 4) | fromHex(value[2 * i + 1]));
    return hash;
}

std::string toHex(const ethash::hash256& hash) {
    std::ostringstream out;
    out << std::hex << std::setfill('0');
    for (const auto byte : hash.bytes) out << std::setw(2) << static_cast<unsigned>(byte);
    return out.str();
}

uint64_t parseNonce(const char* text) {
    return std::stoull(text, nullptr, 16);
}

}  // namespace

int main() {
    size_t passed = 0;
    ethash::epoch_context_ptr context{nullptr, ethash_destroy_epoch_context};

    for (const auto& test : progpow_hash_test_cases) {
        const auto epoch = ethash::get_epoch_number(test.block_number);
        if (!context || context->epoch_number != epoch)
            context = ethash::create_epoch_context(epoch);
        if (!context) {
            std::cerr << "could not create epoch context for epoch " << epoch << "\n";
            return 2;
        }

        const auto header = parseHash256(test.header_hash_hex);
        const auto nonce = parseNonce(test.nonce_hex);
        const auto expectedMix = parseHash256(test.mix_hash_hex);
        const auto expectedFinal = parseHash256(test.final_hash_hex);
        const auto result = progpow::hash(*context, test.block_number, header, nonce);

        if (toHex(result.mix_hash) != test.mix_hash_hex || toHex(result.final_hash) != test.final_hash_hex) {
            std::cerr << "vector mismatch at block " << test.block_number << "\n"
                      << "expected mix=" << test.mix_hash_hex << " actual=" << toHex(result.mix_hash) << "\n"
                      << "expected final=" << test.final_hash_hex << " actual=" << toHex(result.final_hash) << "\n";
            return 1;
        }
        if (!progpow::verify(*context, test.block_number, header, result.mix_hash, nonce, result.final_hash)) {
            std::cerr << "verification failed for valid vector at block " << test.block_number << "\n";
            return 1;
        }

        auto tamperedMix = result.mix_hash;
        ++tamperedMix.bytes[0];
        if (progpow::verify(*context, test.block_number, header, tamperedMix, nonce, result.final_hash)) {
            std::cerr << "tampered mix accepted at block " << test.block_number << "\n";
            return 1;
        }
        ++passed;
    }

    std::cout << "C1 ProgPoW vector conformance passed: " << passed << " vectors\n";
    return 0;
}
