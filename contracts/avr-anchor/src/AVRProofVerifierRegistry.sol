// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stable adapter boundary for a versioned AVR proof verifier.
/// @dev The adapter is responsible for cryptographic verification of the exact
/// proof and public-values bytes. Receipt parsing stays off-chain for the
/// current JSON journal format; the registry records the journal digest.
interface IAVRProofVerifier {
    function verifyProof(bytes calldata proof, bytes calldata publicValues) external view returns (bool);
}

/// @notice Alpha lifecycle control for EVM AVR proof-verifier versions.
/// @dev This contract is intentionally not a proxy. A new verifier version is
/// scheduled, activated after a delay, and can only be retired, never replaced.
contract AVRProofVerifierRegistry {
    uint64 public constant MINIMUM_GOVERNANCE_DELAY = 2 days;
    uint32 public constant ABSOLUTE_MAX_PROOF_BYTES = 4_096;
    uint32 public constant ABSOLUTE_MAX_PUBLIC_VALUES_BYTES = 4_096;

    struct VerifierVersion {
        address verifier;
        bytes32 statementId;
        bytes32 programCommitment;
        uint64 activationTime;
        uint64 activatedAt;
        uint64 retiredAt;
        uint32 maxProofBytes;
        uint32 maxPublicValuesBytes;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    uint64 public immutable minimumActivationDelay;
    bool public paused;

    mapping(bytes32 versionId => VerifierVersion version) private versions;
    mapping(bytes32 versionId => mapping(bytes32 publicValuesDigest => uint64 verifiedAt)) private verificationTimes;

    event OwnershipTransferProposed(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event GuardianChanged(address indexed previousGuardian, address indexed newGuardian);
    event VerifierProposed(
        bytes32 indexed versionId,
        address indexed verifier,
        bytes32 indexed statementId,
        bytes32 programCommitment,
        uint64 activationTime,
        uint32 maxProofBytes,
        uint32 maxPublicValuesBytes
    );
    event VerifierActivated(bytes32 indexed versionId, address indexed verifier, uint64 activatedAt);
    event VerifierRetired(bytes32 indexed versionId, address indexed actor, uint64 retiredAt, bool emergency);
    event PauseChanged(bool paused, address indexed actor);
    event AVRProofVerified(
        bytes32 indexed versionId,
        bytes32 indexed publicValuesDigest,
        bytes32 proofDigest,
        address submitter,
        uint64 verifiedAt
    );

    error Unauthorized();
    error ZeroAddress();
    error InvalidDelay();
    error RoleCollision();
    error InvalidVersionId();
    error InvalidBinding();
    error InvalidResourceLimit();
    error VersionAlreadyExists(bytes32 versionId);
    error UnknownVersion(bytes32 versionId);
    error VersionNotReady(bytes32 versionId, uint64 activationTime);
    error VersionInactive(bytes32 versionId);
    error VersionRetired(bytes32 versionId);
    error RegistryPaused();
    error ProofTooLarge(uint256 actual, uint256 maximum);
    error PublicValuesTooLarge(uint256 actual, uint256 maximum);
    error InvalidProof();
    error ProofAlreadyRecorded(bytes32 versionId, bytes32 publicValuesDigest);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyGuardianOrOwner() {
        if (msg.sender != owner && msg.sender != guardian) revert Unauthorized();
        _;
    }

    constructor(address initialOwner, address initialGuardian, uint64 activationDelay) {
        if (initialOwner == address(0) || initialGuardian == address(0)) revert ZeroAddress();
        if (initialOwner == initialGuardian) revert RoleCollision();
        if (activationDelay < MINIMUM_GOVERNANCE_DELAY) revert InvalidDelay();
        owner = initialOwner;
        guardian = initialGuardian;
        minimumActivationDelay = activationDelay;
    }

    function proposeOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert ZeroAddress();
        pendingOwner = nextOwner;
        emit OwnershipTransferProposed(owner, nextOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function setGuardian(address nextGuardian) external onlyOwner {
        if (nextGuardian == address(0)) revert ZeroAddress();
        address previousGuardian = guardian;
        guardian = nextGuardian;
        emit GuardianChanged(previousGuardian, nextGuardian);
    }

    function proposeVerifier(
        bytes32 versionId,
        address verifier,
        bytes32 statementId,
        bytes32 programCommitment,
        uint32 maxProofBytes,
        uint32 maxPublicValuesBytes
    ) external onlyOwner {
        if (versionId == bytes32(0)) revert InvalidVersionId();
        if (verifier == address(0)) revert ZeroAddress();
        if (statementId == bytes32(0) || programCommitment == bytes32(0)) revert InvalidBinding();
        if (versions[versionId].verifier != address(0)) revert VersionAlreadyExists(versionId);
        if (
            maxProofBytes == 0 || maxPublicValuesBytes == 0 || maxProofBytes > ABSOLUTE_MAX_PROOF_BYTES
                || maxPublicValuesBytes > ABSOLUTE_MAX_PUBLIC_VALUES_BYTES
        ) revert InvalidResourceLimit();

        uint64 activationTime = uint64(block.timestamp) + minimumActivationDelay;
        versions[versionId] = VerifierVersion({
            verifier: verifier,
            statementId: statementId,
            programCommitment: programCommitment,
            activationTime: activationTime,
            activatedAt: 0,
            retiredAt: 0,
            maxProofBytes: maxProofBytes,
            maxPublicValuesBytes: maxPublicValuesBytes
        });
        emit VerifierProposed(
            versionId, verifier, statementId, programCommitment, activationTime, maxProofBytes, maxPublicValuesBytes
        );
    }

    function activateVerifier(bytes32 versionId) external {
        VerifierVersion storage version = versions[versionId];
        if (version.verifier == address(0)) revert UnknownVersion(versionId);
        if (version.retiredAt != 0) revert VersionRetired(versionId);
        if (version.activatedAt != 0) revert VersionInactive(versionId);
        if (block.timestamp < version.activationTime) revert VersionNotReady(versionId, version.activationTime);
        if (version.verifier.code.length == 0) revert InvalidBinding();
        version.activatedAt = uint64(block.timestamp);
        emit VerifierActivated(versionId, version.verifier, version.activatedAt);
    }

    function retireVerifier(bytes32 versionId) external onlyOwner {
        _retire(versionId, false);
    }

    function emergencyRetireVerifier(bytes32 versionId) external onlyGuardianOrOwner {
        _retire(versionId, true);
    }

    function pause() external onlyGuardianOrOwner {
        paused = true;
        emit PauseChanged(true, msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit PauseChanged(false, msg.sender);
    }

    function verifyAndRecord(bytes32 versionId, bytes calldata proof, bytes calldata publicValues) external {
        if (paused) revert RegistryPaused();
        VerifierVersion storage version = versions[versionId];
        if (version.verifier == address(0)) revert UnknownVersion(versionId);
        if (version.activatedAt == 0) revert VersionInactive(versionId);
        if (version.retiredAt != 0) revert VersionRetired(versionId);
        if (proof.length > version.maxProofBytes) revert ProofTooLarge(proof.length, version.maxProofBytes);
        if (publicValues.length == 0 || publicValues.length > version.maxPublicValuesBytes) {
            revert PublicValuesTooLarge(publicValues.length, version.maxPublicValuesBytes);
        }
        bytes32 publicValuesDigest = keccak256(publicValues);
        if (verificationTimes[versionId][publicValuesDigest] != 0) revert ProofAlreadyRecorded(versionId, publicValuesDigest);
        if (!IAVRProofVerifier(version.verifier).verifyProof(proof, publicValues)) {
            revert InvalidProof();
        }
        uint64 verifiedAt = uint64(block.timestamp);
        verificationTimes[versionId][publicValuesDigest] = verifiedAt;
        emit AVRProofVerified(versionId, publicValuesDigest, keccak256(proof), msg.sender, verifiedAt);
    }

    function getVerifier(bytes32 versionId) external view returns (VerifierVersion memory) {
        VerifierVersion memory version = versions[versionId];
        if (version.verifier == address(0)) revert UnknownVersion(versionId);
        return version;
    }

    function verificationTime(bytes32 versionId, bytes32 publicValuesDigest) external view returns (uint64) {
        return verificationTimes[versionId][publicValuesDigest];
    }

    function _retire(bytes32 versionId, bool emergency) private {
        VerifierVersion storage version = versions[versionId];
        if (version.verifier == address(0)) revert UnknownVersion(versionId);
        if (version.retiredAt != 0) revert VersionRetired(versionId);
        version.retiredAt = uint64(block.timestamp);
        emit VerifierRetired(versionId, msg.sender, version.retiredAt, emergency);
    }
}
