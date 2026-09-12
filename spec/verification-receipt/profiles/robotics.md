# Robotics and machine events profile 0.4.0-alpha

Subjects: `core:robot`, `core:vehicle`, `core:drone` or `core:machine`.
`machine:configuration` commits a manifest of firmware, controller, calibration,
safety configuration and relevant maintenance versions;
`machine:authority` commits the operator/mission/operating-permission evidence;
`machine:event` commits a significant event or telemetry-window package. Optional
roles can separate sensors, rosbag/MCAP chunks, interventions, hardware attestation
and maintenance. The actual manifest contents require application appraisal.

Stream and observation fields are mandatory. Allocate a random stream ID per
recording/boot session. Start sequence at decimal string zero with no predecessor;
each successor references the prior receipt hash. Sequence is capture order,
not sensor acquisition order. A reboot, clock reset, profile change or key rotation
starts a new session, optionally linked with `core:continues`. Monotonic ticks are
nanoseconds from the session clock epoch; simulation ticks have a simulation epoch;
UTC ticks are nanoseconds since Unix epoch. Unknown uncertainty is null, not zero.
`claimedAt` is the issuer-claimed receipt recording time, separate from observed
event time and later chain inclusion. Record out-of-order/dropped samples and clock
calibration inside the event package. Offline capture can anchor later.

Assurance: this is an audit trail, never a real-time safety controller or proof
that a physical action was safe or occurred. Sensor spoofing, compromised gateways,
pre-capture omission, stream forks/truncation and clock manipulation remain threats.
Check profile/specification hashes, evidence openings, issuer signatures, stream
links and canonical inclusion. Hardware attestation additionally requires its own
freshness, endorsements and verifier policy. Sequence continuity cannot detect an
undisclosed tail or prove no parallel log exists. Keep telemetry, locations, video,
machine identities and salts private. Capture/retention and device attestation
adapters are outside this profile; the current EVM issuer may be a gateway.
