// Copyright (c) 2024 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'package:dart_libp2p/core/peer/peer_id.dart';

/// Observer interface for relay server metrics
/// 
/// Implementations can track relay server operations including
/// reservations, relay connections, bandwidth usage, and resource limits.
abstract class RelayServerMetricsObserver {
  /// Called when a peer requests a reservation
  void onReservationRequested(PeerId peerId);
  
  /// Called when a reservation is granted to a peer
  void onReservationGranted(PeerId peerId, DateTime expiration);
  
  /// Called when a reservation request is denied
  void onReservationDenied(PeerId peerId, String reason);
  
  /// Called when a reservation expires
  void onReservationExpired(PeerId peerId);
  
  /// Called when a relay connection is requested
  void onRelayConnectRequested(PeerId srcPeer, PeerId dstPeer, {String? sessionId});
  
  /// Called when a relay connection is successfully established
  void onRelayConnectEstablished(PeerId srcPeer, PeerId dstPeer, {String? sessionId});
  
  /// Called when a relay connection fails to establish
  void onRelayConnectFailed(PeerId srcPeer, PeerId dstPeer, String reason, {String? sessionId});
  
  /// Called when a relay connection is closed
  void onRelayConnectionClosed(
    PeerId srcPeer,
    PeerId dstPeer,
    Duration duration,
    int totalBytesRelayed, {
    String? sessionId,
  });
  
  /// Called when bytes are relayed between peers
  void onBytesRelayed(PeerId srcPeer, PeerId dstPeer, int bytes, {String? sessionId});
  
  /// Called when a resource limit is exceeded
  void onResourceLimitExceeded(PeerId peerId, String limitType);
}

