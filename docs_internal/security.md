# Security Model

EnvoyMesh must protect the owner before it helps the network.

The most important rule is that an Envoy is not allowed to browse the owner's computer. It can only access explicitly approved data and capabilities.

## Threats

### Prompt Injection

A remote peer may send a malicious message that tries to convince the agent to reveal private information, ignore policy, or call unauthorized tools.

Mitigation:

- Validate all inbound messages with strict schemas.
- Evaluate trust policy before invoking an LLM.
- Keep sensitive operations outside free-form model control.
- Redact responses before sending them to peers.

### Filesystem Leakage

A bug or compromised agent may try to read private files outside the shared vault.

Mitigation:

- Run file-reading logic in a sandboxed process.
- Mount only approved vault paths.
- Use deny-by-default permissions.
- Keep secrets and key material outside the agent runtime.

### Identity Spoofing

An attacker may pretend to be a trusted friend.

Mitigation:

- Require signed messages.
- Bind peer identity to public keys.
- Store trust decisions locally.
- Support revocation and key rotation.

### Sybil Attacks

An attacker may create many fake peers to appear trustworthy or overwhelm the node.

Mitigation:

- Rate-limit unknown peers.
- Require challenge workflows for strangers.
- Prefer direct trust and referrals over public discovery.
- Avoid granting meaningful access based only on network presence.

### Data Over-Sharing

The Envoy may share a raw document when a summary would have been enough.

Mitigation:

- Assign permissions per peer and per document.
- Default unknown peers to metadata-only or no access.
- Require owner approval for raw file transfer.
- Keep an audit log of outbound disclosures.

## Security Boundaries

### Diplomat

The Diplomat is the network-facing component. It handles libp2p connections, message parsing, peer identity, and rate limiting.

It should not have direct access to the private filesystem or model tools.

### Bond Engine

The Bond Engine makes authorization decisions. It converts a peer identity and request intent into an allow, deny, challenge, or approval-required decision.

It should be deterministic and testable.

### Brain

The Brain performs local reasoning, summarization, and retrieval-augmented answering.

It should receive only approved context from the vault. It should not be able to make arbitrary outbound network calls.

### Vault

The Vault contains owner-approved shared data.

Only data inside the vault can be indexed or shared. Access to the vault should still be mediated by document-level policy.

## Minimal Permission Model

Each request should be evaluated with:

- Sender identity.
- Sender bond level.
- Intent type.
- Target resource.
- Requested operation.
- Maximum response sensitivity.
- Whether raw file transfer is requested.

Example operations:

- `metadata.read`
- `summary.read`
- `snippet.read`
- `file.read`
- `task.submit`
- `state.sync`

Example sensitivity levels:

- `public`
- `friends`
- `trusted`
- `private`

## Recommended First Version Rules

For the first prototype, use conservative rules:

- Unknown peers can only request a bond workflow.
- Trusted peers can ask knowledge queries, but receive summaries only.
- Raw file sharing requires explicit owner approval.
- The Envoy can read only from `shared_vault/`.
- The LLM worker cannot access the network.
- All inbound and outbound messages are logged locally.

## Audit Log

Every meaningful exchange should create an audit event:

- Timestamp.
- Peer ID.
- Verified public key.
- Intent.
- Decision.
- Resources accessed.
- Data sensitivity.
- Response type.

The audit log helps the owner understand what the Envoy did while they were offline.
