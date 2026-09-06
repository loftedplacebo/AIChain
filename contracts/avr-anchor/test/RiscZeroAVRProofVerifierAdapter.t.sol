// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRiscZeroVerifier, RiscZeroAVRProofVerifierAdapter} from "../src/RiscZeroAVRProofVerifierAdapter.sol";

contract MockRiscZeroVerifier is IRiscZeroVerifier {
    bytes32 internal immutable expectedImageId;
    bytes32 internal immutable expectedJournalDigest;
    bytes32 internal immutable expectedSealDigest;

    constructor(bytes32 imageId, bytes memory seal, bytes memory journal) {
        expectedImageId = imageId;
        expectedJournalDigest = sha256(journal);
        expectedSealDigest = keccak256(seal);
    }

    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view {
        require(imageId == expectedImageId, "wrong image");
        require(journalDigest == expectedJournalDigest, "wrong journal");
        require(keccak256(seal) == expectedSealDigest, "wrong seal");
    }
}

contract RiscZeroAVRProofVerifierAdapterTest {
    bytes32 internal constant IMAGE_ID = keccak256("aichain:risc0:zk001:guest");
    bytes internal constant SEAL = hex"01020304";
    bytes internal constant JOURNAL = hex"05060708";

    function testPinsImageAndExactJournalBytes() external {
        MockRiscZeroVerifier verifier = new MockRiscZeroVerifier(IMAGE_ID, SEAL, JOURNAL);
        RiscZeroAVRProofVerifierAdapter adapter = new RiscZeroAVRProofVerifierAdapter(verifier, IMAGE_ID);
        require(adapter.verifyProof(SEAL, JOURNAL), "valid proof must verify");

        (bool changedSeal,) = address(adapter).call(abi.encodeCall(adapter.verifyProof, (hex"01020305", JOURNAL)));
        require(!changedSeal, "changed seal must reject");
        (bool changedJournal,) = address(adapter).call(abi.encodeCall(adapter.verifyProof, (SEAL, hex"05060709")));
        require(!changedJournal, "changed journal must reject");
    }
}
