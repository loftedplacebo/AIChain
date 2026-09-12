# AI/software supply-chain profile 0.4.0-alpha

Subjects: `core:artifact`, `core:agent` or `core:service`.
`supply:materials` commits the material/input inventory;
`supply:process` commits the producing activity, tool/runtime/configuration and
producer evidence; `supply:product` commits the resulting artifact inventory.
Evidence packages may embed existing signed provenance formats. Use one or more
`core:derived-from` links for upstream receipts. Streams and clocks are optional.

Assurance: an anchored lineage claim is not proof of complete materials,
reproducible builds, training-data rights or a trustworthy producer. Missing inputs,
substitution and forged provenance remain possible before capture. Independently
verify profile/specification hashes, openings, producer signatures, external
provenance validation, upstream receipts and canonical inclusion. Keep private
datasets, build details, identity mappings and salts off-chain. Traversal, cycle
detection and application-specific completeness checks belong to the consumer.
