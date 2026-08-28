use aichain_risc0_policy_evaluation_methods::{
    AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ELF, AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID,
};
use aichain_zk_policy_core::{Input, PublicValues};
use risc0_zkvm::{default_prover, ExecutorEnv};
use std::{env, fs, time::Instant};

fn main() {
    let fixture = env::args()
        .nth(1)
        .unwrap_or_else(|| "../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json".to_string());
    let input: Input =
        serde_json::from_slice(&fs::read(&fixture).expect("read fixture")).expect("parse fixture");
    let execution_env = ExecutorEnv::builder()
        .write(&input)
        .expect("encode private input")
        .build()
        .expect("build executor environment");
    let started = Instant::now();
    let prove_info = default_prover()
        .prove(execution_env, AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ELF)
        .expect("generate RISC Zero receipt");
    let receipt = prove_info.receipt;
    let public: PublicValues = receipt.journal.decode().expect("decode public journal");
    assert_eq!(
        public, input.expected_public,
        "receipt/public fixture mismatch"
    );
    receipt
        .verify(AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID)
        .expect("independently verify RISC Zero receipt");
    println!(
        "{{\"stack\":\"risc0\",\"mode\":\"prove-and-verify\",\"fixture\":\"{}\",\"elapsedMs\":{},\"receiptId\":\"{}\"}}",
        fixture.replace('\\', "/"),
        started.elapsed().as_millis(),
        public.receipt_id
    );
}
