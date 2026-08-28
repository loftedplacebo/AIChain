use aichain_risc0_policy_evaluation_methods::{
    AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ELF, AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID,
};
use aichain_zk_policy_core::{Input, PublicValues};
use risc0_zkvm::{default_prover, ExecutorEnv};
use std::{env, fs, time::Instant};

fn require_expected_public(actual: &PublicValues, expected: &PublicValues) -> Result<(), &'static str> {
    if actual == expected {
        Ok(())
    } else {
        Err("verified receipt is not bound to the expected AVR public values")
    }
}

fn prove(input: &Input) -> risc0_zkvm::Receipt {
    let execution_env = ExecutorEnv::builder()
        .write(input)
        .expect("encode private input")
        .build()
        .expect("build executor environment");
    default_prover()
        .prove(execution_env, AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ELF)
        .expect("generate RISC Zero receipt")
        .receipt
}

fn main() {
    let mut args = env::args().skip(1);
    let mode = args.next().unwrap_or_else(|| "--prove".to_string());
    if mode != "--prove" && mode != "--security-tests" {
        panic!("usage: aichain-risc0-policy-evaluation-host [--prove|--security-tests] [fixture]");
    }
    let fixture = args
        .next()
        .unwrap_or_else(|| "../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json".to_string());
    let input: Input =
        serde_json::from_slice(&fs::read(&fixture).expect("read fixture")).expect("parse fixture");
    let started = Instant::now();
    let receipt = prove(&input);
    let public: PublicValues = receipt.journal.decode().expect("decode public journal");
    require_expected_public(&public, &input.expected_public).expect("receipt/public fixture mismatch");
    receipt
        .verify(AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID)
        .expect("independently verify RISC Zero receipt");
    if mode == "--security-tests" {
        let mut invalid_private_input = input.clone();
        invalid_private_input.private_witness.action.amount = invalid_private_input
            .private_witness
            .policy
            .max_amount
            .checked_add(1)
            .expect("fixture policy maximum must leave room for an invalid amount");
        assert!(
            aichain_zk_policy_core::verify(&invalid_private_input).is_err(),
            "invalid private witness passed the shared statement"
        );
        assert!(
            std::panic::catch_unwind(|| prove(&invalid_private_input)).is_err(),
            "RISC Zero guest accepted an invalid private witness"
        );

        let mut wrong_image_id = AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID;
        wrong_image_id[0] ^= 1;
        assert!(
            receipt.verify(wrong_image_id).is_err(),
            "RISC Zero receipt verified for a different image ID"
        );

        let mut tampered_receipt = receipt.clone();
        assert!(
            !tampered_receipt.journal.bytes.is_empty(),
            "RISC Zero receipt must contain a committed journal"
        );
        tampered_receipt.journal.bytes[0] ^= 1;
        assert!(
            tampered_receipt
                .verify(AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID)
                .is_err(),
            "RISC Zero verifier accepted a tampered journal"
        );

        let mut substituted_public = public.clone();
        substituted_public.receipt_id = format!("0x{}", "ff".repeat(32));
        assert!(
            require_expected_public(&substituted_public, &input.expected_public).is_err(),
            "application accepted a receipt bound to a different AVR receipt ID"
        );
        println!(
            "{{\"stack\":\"risc0\",\"mode\":\"security-tests\",\"fixture\":\"{}\",\"elapsedMs\":{},\"checks\":[\"invalid-private-witness\",\"wrong-image-id\",\"tampered-journal\",\"wrong-receipt-binding\"]}}",
            fixture.replace('\\', "/"),
            started.elapsed().as_millis()
        );
        return;
    }
    println!(
        "{{\"stack\":\"risc0\",\"mode\":\"prove-and-verify\",\"fixture\":\"{}\",\"elapsedMs\":{},\"receiptId\":\"{}\"}}",
        fixture.replace('\\', "/"),
        started.elapsed().as_millis(),
        public.receipt_id
    );
}
