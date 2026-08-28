use aichain_zk_policy_core::{Input, PublicValues};
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, ProvingKey, SP1PublicValues, SP1Stdin,
};
use std::{env, fs, time::Instant};

const ELF: Elf = include_elf!("aichain-sp1-policy-evaluation-program");
const WRONG_KEY_ELF: Elf = include_elf!("aichain-sp1-policy-evaluation-wrong-key-program");

fn require_expected_public(actual: &PublicValues, expected: &PublicValues) -> Result<(), &'static str> {
    if actual == expected {
        Ok(())
    } else {
        Err("verified proof is not bound to the expected AVR public values")
    }
}

fn stdin_for(input: &Input) -> SP1Stdin {
    let mut stdin = SP1Stdin::new();
    stdin.write(input);
    stdin
}

fn main() {
    let mut args = env::args().skip(1);
    let mode = args.next().unwrap_or_else(|| "--execute".to_string());
    if mode != "--execute" && mode != "--prove" && mode != "--security-tests" {
        panic!("usage: aichain-sp1-policy-evaluation [--execute|--prove|--security-tests] [fixture]");
    }
    let fixture = args
        .next()
        .unwrap_or_else(|| "../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json".to_string());
    let input: Input =
        serde_json::from_slice(&fs::read(&fixture).expect("read fixture")).expect("parse fixture");
    let client = ProverClient::from_env();
    let started = Instant::now();
    if mode == "--execute" {
        let (output, report) = client.execute(ELF, stdin_for(&input)).run().expect("execute SP1 guest");
        let public: PublicValues =
            serde_json::from_slice(output.as_slice()).expect("decode public values");
        require_expected_public(&public, &input.expected_public)
            .expect("guest/public fixture mismatch");
        println!("{{\"stack\":\"sp1\",\"mode\":\"execute\",\"fixture\":\"{}\",\"elapsedMs\":{},\"cycles\":{},\"receiptId\":\"{}\"}}", fixture.replace('\\', "/"), started.elapsed().as_millis(), report.total_instruction_count(), public.receipt_id);
        return;
    }
    let pk = client.setup(ELF).expect("set up SP1 program");
    let proof = client
        .prove(&pk, stdin_for(&input))
        .run()
        .expect("generate SP1 proof");
    client
        .verify(&proof, pk.verifying_key(), None)
        .expect("independently verify SP1 proof");
    let public: PublicValues =
        serde_json::from_slice(proof.public_values.as_slice()).expect("decode proof public values");
    require_expected_public(&public, &input.expected_public).expect("proof/public fixture mismatch");
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
        let (invalid_output, _) = client
            .execute(ELF, stdin_for(&invalid_private_input))
            .run()
            .expect("execute invalid SP1 guest input");
        let invalid_public = serde_json::from_slice::<PublicValues>(invalid_output.as_slice());
        assert!(
            invalid_public
                .as_ref()
                .ok()
                .and_then(|actual| require_expected_public(actual, &input.expected_public).ok())
                .is_none(),
            "SP1 guest emitted public values accepted as the valid AVR binding"
        );

        let wrong_pk = client
            .setup(WRONG_KEY_ELF)
            .expect("set up distinct negative-test program");
        assert!(
            client.verify(&proof, wrong_pk.verifying_key(), None).is_err(),
            "SP1 proof verified under a different program verification key"
        );

        let mut tampered_proof = proof.clone();
        let mut tampered_public_values = tampered_proof.public_values.to_vec();
        assert!(
            !tampered_public_values.is_empty(),
            "SP1 proof must contain committed public values"
        );
        tampered_public_values[0] ^= 1;
        tampered_proof.public_values = SP1PublicValues::from(tampered_public_values.as_slice());
        assert!(
            client.verify(&tampered_proof, pk.verifying_key(), None).is_err(),
            "SP1 verifier accepted tampered committed public values"
        );

        let mut substituted_public = public.clone();
        substituted_public.receipt_id = format!("0x{}", "ff".repeat(32));
        assert!(
            require_expected_public(&substituted_public, &input.expected_public).is_err(),
            "application accepted a proof bound to a different receipt ID"
        );
        println!("{{\"stack\":\"sp1\",\"mode\":\"security-tests\",\"fixture\":\"{}\",\"elapsedMs\":{},\"checks\":[\"invalid-private-witness\",\"wrong-verifier-key\",\"tampered-public-values\",\"wrong-receipt-binding\"]}}", fixture.replace('\\', "/"), started.elapsed().as_millis());
        return;
    }
    println!("{{\"stack\":\"sp1\",\"mode\":\"prove-and-verify\",\"fixture\":\"{}\",\"elapsedMs\":{},\"receiptId\":\"{}\"}}", fixture.replace('\\', "/"), started.elapsed().as_millis(), input.expected_public.receipt_id);
}
