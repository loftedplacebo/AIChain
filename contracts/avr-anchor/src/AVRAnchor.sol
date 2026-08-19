// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Phase 1B prototype anchor for versioned AI Verification Receipts.
/// @dev This contract intentionally stores only opaque commitments and no raw AI data.
contract AVRAnchor {
    struct Anchor {
        address issuer;
        bytes32 commitmentsRoot;
        uint64 includedAt;
        string schemaVersion;
    }

    mapping(bytes32 receiptId => Anchor anchor) private anchors;

    event ReceiptAnchored(
        bytes32 indexed receiptId,
        bytes32 indexed commitmentsRoot,
        address indexed issuer,
        string schemaVersion,
        uint64 includedAt
    );

    error EmptyReceiptId();
    error EmptyCommitmentsRoot();
    error EmptySchemaVersion();
    error ReceiptAlreadyAnchored(bytes32 receiptId);
    error UnknownReceipt(bytes32 receiptId);

    function anchorReceipt(bytes32 receiptId, bytes32 commitmentsRoot, string calldata schemaVersion) external {
        if (receiptId == bytes32(0)) revert EmptyReceiptId();
        if (commitmentsRoot == bytes32(0)) revert EmptyCommitmentsRoot();
        if (bytes(schemaVersion).length == 0) revert EmptySchemaVersion();
        if (anchors[receiptId].issuer != address(0)) revert ReceiptAlreadyAnchored(receiptId);

        uint64 includedAt = uint64(block.timestamp);
        anchors[receiptId] = Anchor({
            issuer: msg.sender,
            commitmentsRoot: commitmentsRoot,
            includedAt: includedAt,
            schemaVersion: schemaVersion
        });

        emit ReceiptAnchored(receiptId, commitmentsRoot, msg.sender, schemaVersion, includedAt);
    }

    function getAnchor(bytes32 receiptId) external view returns (Anchor memory) {
        Anchor memory anchor = anchors[receiptId];
        if (anchor.issuer == address(0)) revert UnknownReceipt(receiptId);
        return anchor;
    }
}
