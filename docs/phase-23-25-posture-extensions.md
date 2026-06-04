/**
 * Posture Policy Extensions (Phases 23-25)
 *
 * New posture policy fields for proactive social graph, agent marketplace,
 * and ambient mesh awareness features. Added to existing posture schemas
 * in packages/protocol/src/index.ts.
 *
 * This file documents the new fields; actual schema updates are applied
 * to the existing schema files.
 */

// =========================================================================
// Phase 23A — SocialProxyPosturePolicySchema extension
// =========================================================================
// New field: autoCircleContacts (boolean, default false)
// When true, the agent auto-sorts bonded contacts into circles based
// on shared topics and capabilities.

// =========================================================================
// Phase 23C — BondSteward config
// =========================================================================
// New fields on NodeConfig (via PersistedNodeConfig):
//   dormantBondThresholdDays?: number  (default 90)
//   autoNudgeDormantBonds?: boolean    (default false)

// =========================================================================
// Phase 24C — CapabilityProviderPosturePolicySchema extension
// =========================================================================
// New field: minReputationScore (number, 0.0–1.0, default 0)
// Minimum reputation score for unbonded task execution.

// =========================================================================
// Phase 25D — NodeConfig extension
// =========================================================================
// New fields on NodeConfig:
//   intentPredictionEnabled?: boolean  (default false)
//   prefetchMaxResults?: number        (default 3)

export {};
