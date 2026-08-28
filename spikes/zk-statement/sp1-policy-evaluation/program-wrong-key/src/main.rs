#![no_main]

sp1_zkvm::entrypoint!(main);

/// Deliberately distinct evaluation guest used only to prove verifier-key rejection.
/// It must never be used for AVR proofs or deployed as an AIChain statement program.
pub fn main() {
    sp1_zkvm::io::commit(&"aichain:negative-test:wrong-verifier-key");
}
