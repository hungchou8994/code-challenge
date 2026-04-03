# Live Scoreboard Backend Module

Implementation-facing specification package for a backend module that accepts authorized score events, updates persistent user scores, and keeps a website's top-10 scoreboard fresh with live updates.

## Phase 1 - Secure Score Ingest Boundary

Phase 1 defines the trusted API edge for score submission. The canonical ingest contract is `POST /v1/score-events`, and it exists to ensure that only authorized producers can submit score-bearing events before any later persistence or projection work is attempted.

This boundary allows exactly two trust patterns:

- trusted service-to-service callers using deployment credentials
- callers presenting a server-issued signed one-time score grant after a completed action

The ordered Phase 1 validation gates are:

1. request schema validation
2. caller authentication
3. issuer allowlist
4. grant expiry
5. user binding
6. points policy
7. nonce / idempotency pre-check
8. edge throttling
9. score-command handoff

The abuse-control model is layered so the edge can cheaply reject bad traffic before expensive work runs:

- coarse per-IP throttling before signature verification
- dedicated invalid-signature penalties for probing traffic
- per-issuer limits once caller identity is known
- per-subject-user limits to prevent targeted score floods
- kill-switch controls for compromised issuers or runaway clients

### Phase 1 Artifacts

- [Score ingest contract](docs/specs/score-ingest-contract.md)
- [Score authorization model](docs/specs/score-authorization-model.md)
- [Score ingest edge protection](docs/specs/score-ingest-edge-protection.md)
- [Score ingest decision matrix](docs/specs/score-ingest-decision-matrix.md)
- [Phase 1 boundary diagram](docs/diagrams/score-ingest-boundary.mmd)

Boundary note: persistence, idempotent mutation, Redis projection, and SSE fan-out are covered in later phases.

## Phase Roadmap

- Phase 1: secure score ingest boundary
- Phase 2: deterministic score commit
- Phase 3: top-10 leaderboard projection
- Phase 4: live leaderboard delivery
- Phase 5: operational recovery and handoff
