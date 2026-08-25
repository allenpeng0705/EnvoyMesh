/// A terminal session running on the home node.
class TerminalSession {
  /// Session ID from the server.
  final String id;

  /// Human-readable session name.
  final String name;

  /// Working directory on the home node.
  final String? cwd;

  /// Running process name (e.g., 'bash', 'zsh').
  final String? runningProcess;

  /// Session creation timestamp.
  final DateTime? createdAt;

  /// `interactive` (default), `exec`, or `pi` (Pi coding TUI).
  final String? role;

  const TerminalSession({
    required this.id,
    required this.name,
    this.cwd,
    this.runningProcess,
    this.createdAt,
    this.role,
  });

  bool get isPi => role == 'pi';

  bool get isEnvoyHarness => role == 'envoy-harness';

  factory TerminalSession.fromJson(Map<String, dynamic> json) {
    // Home node returns 'sessionId' and 'title'; we also accept 'id' and
    // 'name' for local DB cache compatibility.
    return TerminalSession(
      id: (json['sessionId'] ?? json['id'] ?? '') as String,
      name: (json['title'] ?? json['name'] ?? '') as String,
      cwd: json['cwd'] as String?,
      runningProcess: json['runningProcess'] as String? ??
          json['running_process'] as String?,
      createdAt: (json['createdAt'] ?? json['created_at']) != null
          ? DateTime.parse(
              (json['createdAt'] ?? json['created_at']) as String)
          : null,
      role: json['role'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        if (cwd != null) 'cwd': cwd,
        if (runningProcess != null) 'running_process': runningProcess,
        if (createdAt != null) 'created_at': createdAt!.toIso8601String(),
        if (role != null) 'role': role,
      };
}
