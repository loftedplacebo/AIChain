// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Development-only authority registry retaining delegation epochs for historical verification.
contract HistoricalAuthorityRegistry {
    struct Organization {
        address controller;
        uint64 registeredAt;
    }

    struct DelegationEpoch {
        bytes32 authorityCommitment;
        uint64 validAfter;
        uint64 validUntil;
        uint64 revokedAt;
    }

    mapping(bytes32 organizationId => Organization organization) private organizations;
    mapping(bytes32 organizationId => mapping(address agent => DelegationEpoch[] epochs)) private delegationHistory;

    event OrganizationRegistered(bytes32 indexed organizationId, address indexed controller, uint64 registeredAt);
    event AgentAuthorised(
        bytes32 indexed organizationId,
        address indexed agent,
        uint256 indexed epoch,
        bytes32 authorityCommitment,
        uint64 validAfter,
        uint64 validUntil
    );
    event AgentEpochRevoked(bytes32 indexed organizationId, address indexed agent, uint256 indexed epoch, uint64 revokedAt);

    error EmptyOrganizationId();
    error OrganizationAlreadyRegistered(bytes32 organizationId);
    error UnknownOrganization(bytes32 organizationId);
    error UnauthorizedController(bytes32 organizationId, address caller);
    error InvalidAgent();
    error EmptyAuthorityCommitment();
    error InvalidValidityWindow(uint64 validAfter, uint64 validUntil);
    error NoRevocableDelegation(bytes32 organizationId, address agent);
    error UnknownDelegationEpoch(bytes32 organizationId, address agent, uint256 epoch);

    function registerOrganization(bytes32 organizationId) external {
        if (organizationId == bytes32(0)) revert EmptyOrganizationId();
        if (organizations[organizationId].controller != address(0)) revert OrganizationAlreadyRegistered(organizationId);
        organizations[organizationId] = Organization({controller: msg.sender, registeredAt: uint64(block.timestamp)});
        emit OrganizationRegistered(organizationId, msg.sender, uint64(block.timestamp));
    }

    function authoriseAgent(
        bytes32 organizationId,
        address agent,
        bytes32 authorityCommitment,
        uint64 validAfter,
        uint64 validUntil
    ) external {
        _requireController(organizationId);
        if (agent == address(0)) revert InvalidAgent();
        if (authorityCommitment == bytes32(0)) revert EmptyAuthorityCommitment();
        if (validUntil <= validAfter) revert InvalidValidityWindow(validAfter, validUntil);
        DelegationEpoch[] storage epochs = delegationHistory[organizationId][agent];
        epochs.push(DelegationEpoch({
            authorityCommitment: authorityCommitment,
            validAfter: validAfter,
            validUntil: validUntil,
            revokedAt: 0
        }));
        emit AgentAuthorised(organizationId, agent, epochs.length - 1, authorityCommitment, validAfter, validUntil);
    }

    function revokeLatestAgentEpoch(bytes32 organizationId, address agent) external {
        _requireController(organizationId);
        DelegationEpoch[] storage epochs = delegationHistory[organizationId][agent];
        for (uint256 cursor = epochs.length; cursor > 0; cursor--) {
            DelegationEpoch storage epoch = epochs[cursor - 1];
            if (epoch.revokedAt == 0) {
                epoch.revokedAt = uint64(block.timestamp);
                emit AgentEpochRevoked(organizationId, agent, cursor - 1, epoch.revokedAt);
                return;
            }
        }
        revert NoRevocableDelegation(organizationId, agent);
    }

    function getOrganization(bytes32 organizationId) external view returns (Organization memory) {
        Organization memory organization = organizations[organizationId];
        if (organization.controller == address(0)) revert UnknownOrganization(organizationId);
        return organization;
    }

    function delegationEpochCount(bytes32 organizationId, address agent) external view returns (uint256) {
        return delegationHistory[organizationId][agent].length;
    }

    function getDelegationEpoch(bytes32 organizationId, address agent, uint256 epoch) external view returns (DelegationEpoch memory) {
        DelegationEpoch[] storage epochs = delegationHistory[organizationId][agent];
        if (epoch >= epochs.length) revert UnknownDelegationEpoch(organizationId, agent, epoch);
        return epochs[epoch];
    }

    function isAuthorisedAt(bytes32 organizationId, address agent, bytes32 authorityCommitment, uint64 atTime)
        external
        view
        returns (bool)
    {
        DelegationEpoch[] storage epochs = delegationHistory[organizationId][agent];
        for (uint256 cursor = epochs.length; cursor > 0; cursor--) {
            DelegationEpoch storage epoch = epochs[cursor - 1];
            if (
                epoch.authorityCommitment == authorityCommitment && atTime >= epoch.validAfter && atTime < epoch.validUntil
                    && (epoch.revokedAt == 0 || atTime < epoch.revokedAt)
            ) return true;
        }
        return false;
    }

    function _requireController(bytes32 organizationId) private view {
        Organization memory organization = organizations[organizationId];
        if (organization.controller == address(0)) revert UnknownOrganization(organizationId);
        if (organization.controller != msg.sender) revert UnauthorizedController(organizationId, msg.sender);
    }
}
