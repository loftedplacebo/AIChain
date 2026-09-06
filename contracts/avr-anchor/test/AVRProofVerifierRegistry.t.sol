// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AVRProofVerifierRegistry, IAVRProofVerifier} from "../src/AVRProofVerifierRegistry.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
}

contract MockAVRProofVerifier is IAVRProofVerifier {
    bytes32 internal immutable expectedProofDigest;
    bytes32 internal immutable expectedPublicValuesDigest;

    constructor(bytes memory proof, bytes memory publicValues) {
        expectedProofDigest = keccak256(proof);
        expectedPublicValuesDigest = keccak256(publicValues);
    }

    function verifyProof(bytes calldata proof, bytes calldata publicValues) external view returns (bool) {
        return keccak256(proof) == expectedProofDigest && keccak256(publicValues) == expectedPublicValuesDigest;
    }
}

contract GuardianActor {
    function pause(AVRProofVerifierRegistry registry) external {
        registry.pause();
    }

    function emergencyRetire(AVRProofVerifierRegistry registry, bytes32 versionId) external {
        registry.emergencyRetireVerifier(versionId);
    }
}

contract AVRProofVerifierRegistryTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 internal constant VERSION = keccak256("aichain:risc0:zk001:0.1.0-draft");
    bytes32 internal constant RECEIPT = keccak256("receipt");
    bytes32 internal constant STATEMENT = keccak256("statement");
    bytes32 internal constant PROGRAM = keccak256("program");
    bytes internal constant PROOF = hex"01020304";
    bytes internal constant PUBLIC_VALUES = hex"05060708";

    AVRProofVerifierRegistry internal registry;
    MockAVRProofVerifier internal verifier;
    GuardianActor internal guardian;

    constructor() {
        guardian = new GuardianActor();
        registry = new AVRProofVerifierRegistry(address(this), address(guardian), 2 days);
        verifier = new MockAVRProofVerifier(PROOF, PUBLIC_VALUES);
    }

    function _activate(bytes32 version) private {
        registry.proposeVerifier(version, address(verifier), STATEMENT, PROGRAM, 64, 64);
        (bool early,) = address(registry).call(abi.encodeCall(registry.activateVerifier, (version)));
        require(!early, "activation must wait for delay");
        AVRProofVerifierRegistry.VerifierVersion memory configured = registry.getVerifier(version);
        vm.warp(configured.activationTime);
        registry.activateVerifier(version);
    }

    function testRecordsExactProofOnceAndRejectsReplayOrTampering() external {
        _activate(VERSION);
        registry.verifyAndRecord(VERSION, PROOF, PUBLIC_VALUES);
        require(registry.verificationTime(VERSION, keccak256(PUBLIC_VALUES)) != 0, "proof record missing");

        (bool replay,) = address(registry).call(abi.encodeCall(registry.verifyAndRecord, (VERSION, PROOF, PUBLIC_VALUES)));
        require(!replay, "replay must reject");
        (bool alteredProof,) = address(registry).call(abi.encodeCall(registry.verifyAndRecord, (VERSION, hex"01020305", PUBLIC_VALUES)));
        require(!alteredProof, "tampered proof must reject");
        (bool alteredPublic,) = address(registry).call(abi.encodeCall(registry.verifyAndRecord, (VERSION, PROOF, hex"05060709")));
        require(!alteredPublic, "tampered public values must reject");
    }

    function testEnforcesCalldataLimitsAndImmutableVersionIdentity() external {
        bytes32 version = keccak256("aichain:risc0:zk001:limits");
        _activate(version);
        bytes memory oversized = new bytes(65);
        (bool proofOversize,) = address(registry).call(abi.encodeCall(registry.verifyAndRecord, (version, oversized, PUBLIC_VALUES)));
        require(!proofOversize, "oversized proof must reject");
        (bool publicOversize,) = address(registry).call(abi.encodeCall(registry.verifyAndRecord, (version, PROOF, oversized)));
        require(!publicOversize, "oversized public values must reject");
        (bool duplicate,) = address(registry).call(abi.encodeCall(registry.proposeVerifier, (version, address(verifier), STATEMENT, PROGRAM, 64, 64)));
        require(!duplicate, "version replacement must reject");
    }

    function testGuardianCanPauseAndEmergencyRetire() external {
        bytes32 version = keccak256("aichain:risc0:zk001:guardian");
        _activate(version);
        guardian.pause(registry);
        require(registry.paused(), "guardian pause failed");
        (bool pausedProof,) = address(registry).call(abi.encodeCall(registry.verifyAndRecord, (version, PROOF, PUBLIC_VALUES)));
        require(!pausedProof, "paused registry must reject proof");
        guardian.emergencyRetire(registry, version);
        registry.unpause();
        (bool retiredProof,) = address(registry).call(abi.encodeCall(registry.verifyAndRecord, (version, PROOF, PUBLIC_VALUES)));
        require(!retiredProof, "retired verifier must reject proof");
    }

    function testRejectsInvalidProposalLimits() external {
        bytes32 version = keccak256("aichain:risc0:zk001:invalid");
        (bool zeroLimit,) = address(registry).call(abi.encodeCall(registry.proposeVerifier, (version, address(verifier), STATEMENT, PROGRAM, 0, 64)));
        require(!zeroLimit, "zero proof limit must reject");
        (bool excessiveLimit,) = address(registry).call(abi.encodeCall(registry.proposeVerifier, (version, address(verifier), STATEMENT, PROGRAM, 4_097, 64)));
        require(!excessiveLimit, "excessive proof limit must reject");
    }

    function testRequiresSeparateRolesAndGovernanceDelay() external {
        try new AVRProofVerifierRegistry(address(this), address(this), 2 days) returns (AVRProofVerifierRegistry) {
            revert("owner and guardian must differ");
        } catch {}
        try new AVRProofVerifierRegistry(address(this), address(guardian), 1 days) returns (AVRProofVerifierRegistry) {
            revert("delay below policy minimum must reject");
        } catch {}
    }
}
