#![no_main]
sp1_zkvm::entrypoint!(main);

use aichain_zk_policy_core::{verify, Input, PublicValues};

pub fn main() {
    let input = sp1_zkvm::io::read::<Input>();
    let public: PublicValues = verify(&input).expect("ZK-001 binding mismatch");
    let encoded = serde_json::to_vec(&public).expect("public JSON");
    sp1_zkvm::io::commit_slice(&encoded);
}
