use aichain_risc0_policy_evaluation_methods::{
    AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ELF, AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID,
};
use aichain_zk_policy_core::{Input, PublicValues};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::{
    default_prover,
    sha::{Digest, Digestible},
    ExecutorEnv, ProverOpts,
};
use serde::Serialize;
use std::{env, fs, time::Instant};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvmExport {
    format: &'static str,
    stack: &'static str,
    stack_version: &'static str,
    statement_version: &'static str,
    image_id: String,
    journal: String,
    journal_digest: String,
    seal: String,
    seal_bytes: usize,
    journal_bytes: usize,
    proving_elapsed_ms: u128,
    receipt_id: String,
}

fn require_expected_public(
    actual: &PublicValues,
    expected: &PublicValues,
) -> Result<(), &'static str> {
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

fn prove_groth16(input: &Input) -> risc0_zkvm::Receipt {
    let execution_env = ExecutorEnv::builder()
        .write(input)
        .expect("encode private input")
        .build()
        .expect("build executor environment");
    default_prover()
        .prove_with_opts(
            execution_env,
            AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ELF,
            &ProverOpts::groth16(),
        )
        .expect("generate EVM-compatible RISC Zero Groth16 receipt")
        .receipt
}

fn hex_bytes(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut value = String::with_capacity(2 + bytes.len() * 2);
    value.push_str("0x");
    for byte in bytes {
        value.push(HEX[(byte >> 4) as usize] as char);
        value.push(HEX[(byte & 0x0f) as usize] as char);
    }
    value
}

fn hex_digest(digest: &Digest) -> String {
    format!("0x{digest}")
}

fn main() {
    let mut args = env::args().skip(1);
    let mode = args.next().unwrap_or_else(|| "--prove".to_string());
    if mode != "--prove" && mode != "--security-tests" && mode != "--evm-export" {
        panic!("usage: aichain-risc0-policy-evaluation-host [--prove|--security-tests|--evm-export] [fixture] [output]");
    }
    let fixture = args
        .next()
        .unwrap_or_else(|| "../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json".to_string());
    let input: Input =
        serde_json::from_slice(&fs::read(&fixture).expect("read fixture")).expect("parse fixture");
    let started = Instant::now();
    if mode == "--evm-export" {
        let output_path = args
            .next()
            .unwrap_or_else(|| "aichain-risc0-evm-proof.json".to_string());
        let receipt = prove_groth16(&input);
        receipt
            .verify(AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID)
            .expect("independently verify exported Groth16 receipt");
        let public: PublicValues = serde_json::from_slice(&receipt.journal.bytes)
            .expect("decode Groth16 public JSON journal");
        require_expected_public(&public, &input.expected_public)
            .expect("Groth16 receipt/public fixture mismatch");
        let seal = encode_seal(&receipt).expect("encode Groth16 seal for EVM");
        let image_id = Digest::from(AICHAIN_RISC0_POLICY_EVALUATION_GUEST_ID);
        let export = EvmExport {
            format: "aichain.risc0-evm-proof-export",
            stack: "risc0",
            stack_version: "3.0.3",
            statement_version: "0.1.0-draft",
            image_id: hex_digest(&image_id),
            journal: hex_bytes(&receipt.journal.bytes),
            journal_digest: hex_digest(&receipt.journal.digest()),
            seal: hex_bytes(&seal),
            seal_bytes: seal.len(),
            journal_bytes: receipt.journal.bytes.len(),
            proving_elapsed_ms: started.elapsed().as_millis(),
            receipt_id: public.receipt_id,
        };
        fs::write(
            &output_path,
            serde_json::to_vec_pretty(&export).expect("encode EVM proof export"),
        )
        .expect("write EVM proof export");
        println!(
            "{{\"stack\":\"risc0\",\"mode\":\"evm-export\",\"output\":\"{}\",\"elapsedMs\":{},\"sealBytes\":{},\"journalBytes\":{}}}",
            output_path.replace('\\', "/"),
            export.proving_elapsed_ms,
            export.seal_bytes,
            export.journal_bytes
        );
        return;
    }
    let receipt = prove(&input);
    let public: PublicValues =
        serde_json::from_slice(&receipt.journal.bytes).expect("decode public JSON journal");
    require_expected_public(&public, &input.expected_public)
        .expect("receipt/public fixture mismatch");
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
