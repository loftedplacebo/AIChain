// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAVRProofVerifier} from "./AVRProofVerifierRegistry.sol";

/// @notice Pinned RISC Zero verifier interface used by the alpha adapter.
/// @dev RISC Zero verifies a seal against a guest image ID and SHA-256 journal
/// digest. A revert means cryptographic verification failed.
interface IRiscZeroVerifier {
    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view;
}

/// @notice Adapts a pinned RISC Zero Groth16 verifier to AIChain's stable
/// proof-registry boundary.
/// @dev The JSON ZK-001 journal is cryptographically bound as exact bytes.
/// Solidity does not parse that JSON; receipt-level extraction is performed by
/// the auditor/SDK and linked through the recorded journal digest.
contract RiscZeroAVRProofVerifierAdapter is IAVRProofVerifier {
    IRiscZeroVerifier public immutable riscZeroVerifier;
    bytes32 public immutable imageId;

    error ZeroAddress();
    error InvalidImageId();

    constructor(IRiscZeroVerifier verifier, bytes32 guestImageId) {
        if (address(verifier) == address(0) || address(verifier).code.length == 0) revert ZeroAddress();
        if (guestImageId == bytes32(0)) revert InvalidImageId();
        riscZeroVerifier = verifier;
        imageId = guestImageId;
    }

    function verifyProof(bytes calldata proof, bytes calldata publicValues) external view returns (bool) {
        riscZeroVerifier.verify(proof, imageId, sha256(publicValues));
        return true;
    }
}
