use aichain_zk_policy_core::{Input, PublicValues};
use sp1_sdk::{
    blocking::{Prover, ProverClient},
    include_elf, Elf, SP1Stdin,
};
use std::{env, fs, path::PathBuf, time::Instant};

const ELF: Elf = include_elf!("aichain-sp1-policy-evaluation-program");

fn main() {
    let fixture = env::args()
        .nth(1)
        .unwrap_or_else(|| "../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json".to_string());
    let input: Input =
        serde_json::from_slice(&fs::read(&fixture).expect("read fixture")).expect("parse fixture");
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);
    let client = ProverClient::from_env();
    let started = Instant::now();
    let (output, report) = client.execute(ELF, stdin).run().expect("execute SP1 guest");
    let public: PublicValues =
        serde_json::from_slice(output.as_slice()).expect("decode public values");
    assert_eq!(
        public, input.expected_public,
        "guest/public fixture mismatch"
    );
    println!("{{\"stack\":\"sp1\",\"mode\":\"execute\",\"fixture\":\"{}\",\"elapsedMs\":{},\"cycles\":{},\"receiptId\":\"{}\"}}", fixture.replace('\\', "/"), started.elapsed().as_millis(), report.total_instruction_count(), public.receipt_id);
}
