/// Common types used by both conn.dart and rcmgr.dart to avoid circular dependencies

// ScopeStat, ResourceScope, and ResourceScopeSpan are now defined in rcmgr.dart
// to consolidate resource management types.

/// Direction specifies whether this is an inbound or an outbound connection.
enum Direction {
  /// Inbound connection
  inbound,

  /// Outbound connection
  outbound,

  /// Unknown or bidirectional
  unknown,
}

// Add other truly common types here if needed.
