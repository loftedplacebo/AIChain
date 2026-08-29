#![no_main]
risc0_zkvm::guest::entry!(main);

use aichain_zk_policy_core::{verify, Input, PublicValues};
use risc0_zkvm::guest::env;

pub fn main() {
    let input: Input = env::read();
    let public: PublicValues = verify(&input).expect("ZK-001 binding mismatch");
    let encoded = serde_json::to_vec(&public).expect("public JSON");
    env::commit_slice(&encoded);
}
