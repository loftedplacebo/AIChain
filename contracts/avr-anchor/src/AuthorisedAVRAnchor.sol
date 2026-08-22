// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface retained deliberately small so the anchor can read a development AuthorityRegistry.
interface IAuthorityRegistryForAVR {
    function isActive(bytes32 organizationId, address agent) external view returns (bool);
    function getDelegation(bytes32 organizationId, address agent)
        external
        view
        returns (bytes32 authorityCommitment, uint64 validAfter, uint64 validUntil, uint64 revokedAt);
}

/// @notice Development-only AVR anchor that requires the submitting wallet to have an active matching delegation.
/// @dev It does not authenticate off-chain credential signatures or evaluate policy/configuration contents.
contract AuthorisedAVRAnchor {
    struct Anchor {
        bytes32 organizationId;
        bytes32 authorityCommitment;
        bytes32 commitmentsRoot;
        address issuer;
        uint64 includedAt;
        string schemaVersion;
    }

    IAuthorityRegistryForAVR public immutable authorityRegistry;
    mapping(bytes32 receiptId => Anchor anchor) private anchors;

    event AuthorisedReceiptAnchored(
        bytes32 indexed receiptId,
        bytes32 indexed organizationId,
        bytes32 indexed authorityCommitment,
        address issuer,
        bytes32 commitmentsRoot,
        string schemaVersion,
        uint64 includedAt
    );

    error EmptyReceiptId();
    error EmptyCommitmentsRoot();
    error EmptyOrganizationId();
    error EmptyAuthorityCommitment();
    error EmptySchemaVersion();
    error ReceiptAlreadyAnchored(bytes32 receiptId);
    error InactiveAgent(bytes32 organizationId, address agent);
    error AuthorityCommitmentMismatch(bytes32 expected, bytes32 received);
    error UnknownReceipt(bytes32 receiptId);

    constructor(address authorityRegistryAddress) {
        authorityRegistry = IAuthorityRegistryForAVR(authorityRegistryAddress);
    }

    function anchorAuthorisedReceipt(
        bytes32 receiptId,
        bytes32 commitmentsRoot,
        bytes32 organizationId,
        bytes32 authorityCommitment,
        string calldata schemaVersion
    ) external {
        if (receiptId == bytes32(0)) revert EmptyReceiptId();
        if (commitmentsRoot == bytes32(0)) revert EmptyCommitmentsRoot();
        if (organizationId == bytes32(0)) revert EmptyOrganizationId();
        if (authorityCommitment == bytes32(0)) revert EmptyAuthorityCommitment();
        if (bytes(schemaVersion).length == 0) revert EmptySchemaVersion();
        if (anchors[receiptId].issuer != address(0)) revert ReceiptAlreadyAnchored(receiptId);
        if (!authorityRegistry.isActive(organizationId, msg.sender)) revert InactiveAgent(organizationId, msg.sender);

        (bytes32 registeredCommitment,,,) = authorityRegistry.getDelegation(organizationId, msg.sender);
        if (registeredCommitment != authorityCommitment) {
            revert AuthorityCommitmentMismatch(registeredCommitment, authorityCommitment);
        }

        uint64 includedAt = uint64(block.timestamp);
        anchors[receiptId] = Anchor({
            organizationId: organizationId,
            authorityCommitment: authorityCommitment,
            commitmentsRoot: commitmentsRoot,
            issuer: msg.sender,
            includedAt: includedAt,
            schemaVersion: schemaVersion
        });
        emit AuthorisedReceiptAnchored(
            receiptId, organizationId, authorityCommitment, msg.sender, commitmentsRoot, schemaVersion, includedAt
        );
    }

    function getAnchor(bytes32 receiptId) external view returns (Anchor memory) {
        Anchor memory anchor = anchors[receiptId];
        if (anchor.issuer == address(0)) revert UnknownReceipt(receiptId);
        return anchor;
    }
}

