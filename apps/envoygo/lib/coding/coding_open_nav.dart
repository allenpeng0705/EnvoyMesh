/// FH-P2-C — EnvoyGo counterpart to Social `open-coding-nav` mesh-work deep-links.
///
/// Callers (push / command palette / tests) can request queue open, enqueue, or
/// run-by-id without depending on Social's `CustomEvent` bus.
library;

class CodingMeshWorkEnqueueRequest {
  const CodingMeshWorkEnqueueRequest({
    required this.prompt,
    required this.cwd,
    this.title,
  });

  final String prompt;
  final String cwd;
  final String? title;
}

class CodingOpenDetail {
  const CodingOpenDetail({
    this.meshWorkQueue = false,
    this.runMeshWorkId,
    this.meshWorkEnqueue,
  });

  final bool meshWorkQueue;
  final String? runMeshWorkId;
  final CodingMeshWorkEnqueueRequest? meshWorkEnqueue;
}

CodingOpenDetail? _pending;
final List<void Function(CodingOpenDetail)> _listeners = [];

/// Store a pending Coding open request and notify live subscribers.
void openCoding(CodingOpenDetail detail) {
  _pending = detail;
  for (final listener in List<void Function(CodingOpenDetail)>.of(_listeners)) {
    listener(detail);
  }
}

/// Take and clear any pending Coding open request.
CodingOpenDetail? takePendingCodingOpen() {
  final next = _pending;
  _pending = null;
  return next;
}

/// Subscribe to live [openCoding] events. Returns an unsubscribe callback.
void Function() subscribeCodingOpen(
  void Function(CodingOpenDetail detail) listener,
) {
  _listeners.add(listener);
  return () => _listeners.remove(listener);
}

/// Test helper — clear pending + listeners.
void resetCodingOpenNavForTests() {
  _pending = null;
  _listeners.clear();
}
