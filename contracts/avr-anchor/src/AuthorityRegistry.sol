// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Phase 1B prototype registry for organisation-controlled agent delegations.
/// @dev This is an opaque-reference registry only; it does not establish real-world identity.
contract AuthorityRegistry {
    struct Organization {
        address controller;
        uint64 registeredAt;
    }

    struct Delegation {
        bytes32 authorityCommitment;
        uint64 validAfter;
        uint64 validUntil;
        uint64 revokedAt;
    }

    mapping(bytes32 organizationId => Organization organization) private organizations;
    mapping(bytes32 organizationId => mapping(address agent => Delegation delegation)) private delegations;

    event OrganizationRegistered(bytes32 indexed organizationId, address indexed controller, uint64 registeredAt);
    event AgentAuthorized(
        bytes32 indexed organizationId,
        address indexed agent,
        bytes32 indexed authorityCommitment,
        uint64 validAfter,
        uint64 validUntil
    );
    event AgentRevoked(bytes32 indexed organizationId, address indexed agent, uint64 revokedAt);

    error EmptyOrganizationId();
    error OrganizationAlreadyRegistered(bytes32 organizationId);
    error UnknownOrganization(bytes32 organizationId);
    error UnauthorizedController(bytes32 organizationId, address caller);
    error InvalidAgent();
    error EmptyAuthorityCommitment();
    error InvalidValidityWindow(uint64 validAfter, uint64 validUntil);
    error UnknownDelegation(bytes32 organizationId, address agent);

    function registerOrganization(bytes32 organizationId) external {
        if (organizationId == bytes32(0)) revert EmptyOrganizationId();
        if (organizations[organizationId].controller != address(0)) {
            revert OrganizationAlreadyRegistered(organizationId);
        }

        uint64 registeredAt = uint64(block.timestamp);
        organizations[organizationId] = Organization({controller: msg.sender, registeredAt: registeredAt});
        emit OrganizationRegistered(organizationId, msg.sender, registeredAt);
    }

    function authorizeAgent(
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

        delegations[organizationId][agent] = Delegation({
            authorityCommitment: authorityCommitment,
            validAfter: validAfter,
            validUntil: validUntil,
            revokedAt: 0
        });
        emit AgentAuthorized(organizationId, agent, authorityCommitment, validAfter, validUntil);
    }

    function revokeAgent(bytes32 organizationId, address agent) external {
        _requireController(organizationId);
        Delegation storage delegation = delegations[organizationId][agent];
        if (delegation.authorityCommitment == bytes32(0)) {
            revert UnknownDelegation(organizationId, agent);
        }

        uint64 revokedAt = uint64(block.timestamp);
        delegation.revokedAt = revokedAt;
        emit AgentRevoked(organizationId, agent, revokedAt);
    }

    function getOrganization(bytes32 organizationId) external view returns (Organization memory) {
        Organization memory organization = organizations[organizationId];
        if (organization.controller == address(0)) revert UnknownOrganization(organizationId);
        return organization;
    }

    function getDelegation(bytes32 organizationId, address agent) external view returns (Delegation memory) {
        Delegation memory delegation = delegations[organizationId][agent];
        if (delegation.authorityCommitment == bytes32(0)) revert UnknownDelegation(organizationId, agent);
        return delegation;
    }

    function isActive(bytes32 organizationId, address agent) external view returns (bool) {
        Delegation memory delegation = delegations[organizationId][agent];
        return delegation.authorityCommitment != bytes32(0)
            && delegation.revokedAt == 0
            && block.timestamp >= delegation.validAfter
            && block.timestamp < delegation.validUntil;
    }

    function _requireController(bytes32 organizationId) private view {
        Organization memory organization = organizations[organizationId];
        if (organization.controller == address(0)) revert UnknownOrganization(organizationId);
        if (organization.controller != msg.sender) revert UnauthorizedController(organizationId, msg.sender);
    }
}
