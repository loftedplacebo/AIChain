// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Phase 1B prototype anchor for Merkle batches of AVR receipt identifiers.
/// @dev Batch roots use sorted Keccak-256 pair hashing; receipt identifiers remain opaque bytes32 values.
contract ReceiptBatchAnchor {
    struct Batch {
        address issuer;
        uint64 includedAt;
        uint64 leafCount;
        string schemaVersion;
    }

    mapping(bytes32 batchRoot => Batch batch) private batches;

    event ReceiptBatchAnchored(
        bytes32 indexed batchRoot,
        address indexed issuer,
        uint64 leafCount,
        string schemaVersion,
        uint64 includedAt
    );

    error EmptyBatchRoot();
    error EmptySchemaVersion();
    error EmptyBatch();
    error BatchAlreadyAnchored(bytes32 batchRoot);
    error UnknownBatch(bytes32 batchRoot);

    function anchorBatch(bytes32 batchRoot, uint64 leafCount, string calldata schemaVersion) external {
        if (batchRoot == bytes32(0)) revert EmptyBatchRoot();
        if (leafCount == 0) revert EmptyBatch();
        if (bytes(schemaVersion).length == 0) revert EmptySchemaVersion();
        if (batches[batchRoot].issuer != address(0)) revert BatchAlreadyAnchored(batchRoot);

        uint64 includedAt = uint64(block.timestamp);
        batches[batchRoot] = Batch({
            issuer: msg.sender,
            includedAt: includedAt,
            leafCount: leafCount,
            schemaVersion: schemaVersion
        });
        emit ReceiptBatchAnchored(batchRoot, msg.sender, leafCount, schemaVersion, includedAt);
    }

    function getBatch(bytes32 batchRoot) external view returns (Batch memory) {
        Batch memory batch = batches[batchRoot];
        if (batch.issuer == address(0)) revert UnknownBatch(batchRoot);
        return batch;
    }

    function verifyMembership(bytes32 receiptId, bytes32[] calldata proof, bytes32 batchRoot) external pure returns (bool) {
        bytes32 computed = receiptId;
        for (uint256 index = 0; index < proof.length; ++index) {
            bytes32 sibling = proof[index];
            computed = computed <= sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
        }
        return computed == batchRoot;
    }
}
