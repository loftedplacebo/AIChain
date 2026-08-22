// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHistoricalAuthorityRegistryForAVR {
    function isAuthorisedAt(bytes32 organizationId, address agent, bytes32 authorityCommitment, uint64 atTime)
        external
        view
        returns (bool);
}

/// @notice Development-only authorised AVR anchor with explicit historical-authorisation check time.
contract HistoricalAuthorisedAVRAnchor {
    struct Anchor {
        bytes32 organizationId;
        bytes32 authorityCommitment;
        bytes32 commitmentsRoot;
        address issuer;
        uint64 authorisationCheckedAt;
        string schemaVersion;
    }

    IHistoricalAuthorityRegistryForAVR public immutable authorityRegistry;
    mapping(bytes32 receiptId => Anchor anchor) private anchors;

    event HistoricalAuthorisedReceiptAnchored(
        bytes32 indexed receiptId,
        bytes32 indexed organizationId,
        bytes32 indexed authorityCommitment,
        address issuer,
        bytes32 commitmentsRoot,
        uint64 authorisationCheckedAt,
        string schemaVersion
    );

    error InvalidAnchorInput();
    error ReceiptAlreadyAnchored(bytes32 receiptId);
    error NotAuthorisedAtInclusion(bytes32 organizationId, address issuer, bytes32 authorityCommitment, uint64 atTime);
    error UnknownReceipt(bytes32 receiptId);

    constructor(address authorityRegistryAddress) {
        authorityRegistry = IHistoricalAuthorityRegistryForAVR(authorityRegistryAddress);
    }

    function anchorAuthorisedReceipt(
        bytes32 receiptId,
        bytes32 commitmentsRoot,
        bytes32 organizationId,
        bytes32 authorityCommitment,
        string calldata schemaVersion
    ) external {
        if (receiptId == bytes32(0) || commitmentsRoot == bytes32(0) || organizationId == bytes32(0)
            || authorityCommitment == bytes32(0) || bytes(schemaVersion).length == 0) revert InvalidAnchorInput();
        if (anchors[receiptId].issuer != address(0)) revert ReceiptAlreadyAnchored(receiptId);
        uint64 checkedAt = uint64(block.timestamp);
        if (!authorityRegistry.isAuthorisedAt(organizationId, msg.sender, authorityCommitment, checkedAt)) {
            revert NotAuthorisedAtInclusion(organizationId, msg.sender, authorityCommitment, checkedAt);
        }
        anchors[receiptId] = Anchor({
            organizationId: organizationId,
            authorityCommitment: authorityCommitment,
            commitmentsRoot: commitmentsRoot,
            issuer: msg.sender,
            authorisationCheckedAt: checkedAt,
            schemaVersion: schemaVersion
        });
        emit HistoricalAuthorisedReceiptAnchored(
            receiptId, organizationId, authorityCommitment, msg.sender, commitmentsRoot, checkedAt, schemaVersion
        );
    }

    function getAnchor(bytes32 receiptId) external view returns (Anchor memory) {
        Anchor memory anchor = anchors[receiptId];
        if (anchor.issuer == address(0)) revert UnknownReceipt(receiptId);
        return anchor;
    }
}

