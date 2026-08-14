/// Phase 58C — when assigner may cancel / reassign a live step (matches Social).
library;

/// Pending delivery Retry age gate (matches `@envoymesh/api` canRetryChainInputDelivery).
const Duration chainInputPendingRetryMinAge = Duration(seconds: 15);

bool canCancelChainStep(String state) {
  return state == 'offered' ||
      state == 'awarded' ||
      state == 'running' ||
      state == 'pending';
}

bool canReassignChainStep(String state) {
  return state == 'awarded' || state == 'running' || state == 'failed';
}

/// Whether assigner UI should offer Retry for a delivery row.
bool canRetryChainInputDelivery({
  required String phase,
  String? updatedAt,
  DateTime? now,
  Duration pendingMinAge = chainInputPendingRetryMinAge,
}) {
  if (phase == 'failed' || phase == 'transferring') return true;
  if (phase != 'pending') return false;
  if (updatedAt == null || updatedAt.isEmpty) return false;
  final parsed = DateTime.tryParse(updatedAt);
  if (parsed == null) return false;
  final clock = now ?? DateTime.now().toUtc();
  return clock.difference(parsed.toUtc()) >= pendingMinAge;
}
