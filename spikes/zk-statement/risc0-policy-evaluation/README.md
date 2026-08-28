# RISC Zero ZK-001 Prototype

This adapter executes the exact same `aichain-zk-policy-core` library used by the SP1 prototype. The guest reads the private ZK-001 witness plus expected public bindings, reconstructs the bindings, and commits only the verified public values.

It is deliberately not added to the lightweight conformance workflow yet. The next RISC Zero task is to install its guest toolchain in a dedicated Linux workflow, compile this method, execute it against the shared fixture, then add proof generation and verification benchmarks.

No RISC Zero proof, EVM verifier, or stack selection is claimed by this scaffold.
