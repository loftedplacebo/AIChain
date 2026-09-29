// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Public anchor for Merkle batches of AVR receipt identifiers.
/// @dev A batch is identified by its publisher and root. Receipt identifiers remain opaque bytes32 values.
contract ReceiptBatchAnchor {
    struct Batch {
        address publisher;
        uint64 includedAt;
        uint64 leafCount;
        string schemaVersion;
    }

    // A root alone is not a globally-owned namespace: two independent publishers
    // can legitimately derive the same root. The scoped identity prevents a
    // mempool observer from reserving another publisher's root first.
    mapping(bytes32 batchId => Batch batch) private batches;

    /// @notice Versioned event for publisher-scoped batches.
    /// @dev The original ReceiptBatchAnchored event belongs to historical deployments.
    event ReceiptBatchAnchoredV2(
        bytes32 indexed batchId,
        bytes32 indexed batchRoot,
        address indexed publisher,
        uint64 leafCount,
        string schemaVersion,
        uint64 includedAt
    );

    error EmptyBatchRoot();
    error EmptySchemaVersion();
    error EmptyBatch();
    error BatchAlreadyAnchored(bytes32 batchId);
    error UnknownBatch(bytes32 batchId);

    /// @notice Computes the immutable identity of a batch anchored by `publisher`.
    /// @dev Includes the contract address and chain ID to prevent cross-deployment replay.
    function batchId(address publisher, bytes32 batchRoot) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), publisher, batchRoot));
    }

    function anchorBatch(bytes32 batchRoot, uint64 leafCount, string calldata schemaVersion) external {
        if (batchRoot == bytes32(0)) revert EmptyBatchRoot();
        if (leafCount == 0) revert EmptyBatch();
        if (bytes(schemaVersion).length == 0) revert EmptySchemaVersion();

        bytes32 id = batchId(msg.sender, batchRoot);
        if (batches[id].publisher != address(0)) revert BatchAlreadyAnchored(id);

        uint64 includedAt = uint64(block.timestamp);
        batches[id] = Batch({
            publisher: msg.sender,
            includedAt: includedAt,
            leafCount: leafCount,
            schemaVersion: schemaVersion
        });
        emit ReceiptBatchAnchoredV2(id, batchRoot, msg.sender, leafCount, schemaVersion, includedAt);
    }

    function getBatch(address publisher, bytes32 batchRoot) external view returns (Batch memory) {
        bytes32 id = batchId(publisher, batchRoot);
        Batch memory batch = batches[id];
        if (batch.publisher == address(0)) revert UnknownBatch(id);
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
