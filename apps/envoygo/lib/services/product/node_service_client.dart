import 'dart:async';

import 'package:envoy_thin_client/services/home_remote_client.dart';

import '../home_rpc_session.dart';
import 'rpc_bindings/agent_rpcs.dart';
import 'rpc_bindings/call_rpcs.dart';
import 'rpc_bindings/chain_rpcs.dart';
import 'rpc_bindings/chat_rpcs.dart';
import 'rpc_bindings/content_rpcs.dart';
import 'rpc_bindings/family_market_rpcs.dart';
import 'rpc_bindings/harness_rpcs.dart';
import 'rpc_bindings/people_rpcs.dart';
import 'rpc_bindings/terminal_rpcs.dart';

/// Typed wrappers around the home node's JSON-RPC methods.
///
/// Each method corresponds to an RPC in `ws-protocol.ts`.
///
/// **Structure (Workstream A4).** The connection/session plumbing lives in
/// [HomeRpcSession] (`home_rpc_session.dart`) and is reusable on its own. This
/// class adds the product surface — the typed bindings for individual RPCs —
/// which is split by concern across `rpc_bindings/*.dart` mixins. A future
/// product app that only needs transport + pairing + request/response should
/// depend on [HomeRpcSession], not on this class.
///
/// **Placement (Workstream A6).** This file is **product-bound** on Axis 1 — it
/// only exists to bind the product half of the home's RPC surface — so it lives
/// in `lib/services/product/` together with the other product-bound services.
/// `lib/services/*.dart` holds the reusable ones.
class NodeServiceClient extends HomeRpcSession
    with
        AgentRpcs,
        CallRpcs,
        ChainRpcs,
        ChatRpcs,
        ContentRpcs,
        FamilyMarketRpcs,
        HarnessRpcs,
        PeopleRpcs,
        TerminalRpcs {
  /// Phase 42 — real event stream. The home emits `call:*` events over the
  /// WebSocket; HomeRemoteClient fans them out via `.on(event, handler)`.
  /// This controller bridges every `call:*` event into a single broadcast
  /// stream that `CallProvider` subscribes to. The event payload (already
  /// the flat `{type, callId, ...}` shape) is forwarded unchanged.
  ///
  /// Previously this returned `const Stream.empty()` (a Phase 38 stub),
  /// which meant the entire callee flow (`call:incoming` → ring → accept)
  /// and every remote-end event (`call:ended`/`call:rejected`/`call:error`)
  /// silently never fired in production — the provider's `handleTestEvent`
  /// seam hid the gap in tests.
  final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();

  static const _callEvents = [
    'call:incoming',
    'call:answered',
    'call:rejected',
    'call:remote-mute',
    'call:ended',
    'call:error',
    'call:ice-candidate',
  ];

  NodeServiceClient(super.homeClient) {
    for (final event in _callEvents) {
      trackTeardown(
        homeClient.on(event, (data) {
          // Normalize: the home emits `{event, data}`; the provider expects
          // a flat map with a `type` field. Re-stamp `type` defensively.
          final payload = data is Map<String, dynamic>
              ? Map<String, dynamic>.from(data)
              : <String, dynamic>{};
          payload['type'] ??= event;
          _eventController.add(payload);
        }),
      );
    }
  }

  /// Release the HomeRemoteClient event subscriptions. Safe to call once
  /// on disposal; the stream closes with it.
  @override
  void dispose() {
    super.dispose();
    _eventController.close();
  }

  /// Stream of unsolicited push events from the home node (`call:*` today;
  /// easily extended). Consumed by [CallProvider].
  Stream<Map<String, dynamic>> get eventStream => _eventController.stream;

  /// A no-op client used by [CallProvider.noop] when the device is
  /// disconnected from the home node.
  factory NodeServiceClient.noop() => NodeServiceClient(
    HomeRemoteClient(
      HomeRemoteClientOptions(
        resolveCandidates: () async => const [],
        createTransport: (_) => throw UnimplementedError(),
      ),
    ),
  );
}
