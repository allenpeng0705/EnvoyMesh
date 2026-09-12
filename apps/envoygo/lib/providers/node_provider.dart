/// Back-compat shim (Workstream A5 — provider split by concern).
///
/// The home/thin-client **connection lifecycle** provider
/// ([nodeProvider] / [NodeNotifier]) now lives in the connection layer at
/// `lib/connection/node_connection_provider.dart`, so that connection state and
/// product state are no longer declared in the same layer. This file re-exports
/// it so existing import paths keep working; new code should import the
/// connection layer directly.
library;

export '../connection/node_connection_provider.dart';
