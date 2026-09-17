/// Package holepunch provides the holepunch service for libp2p.
///
/// The holepunch service provides direct connection establishment capabilities
/// for libp2p nodes behind NATs/firewalls. It coordinates hole punching between
/// peers to establish direct connections.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/holepunch
/// to Dart, using native Dart idioms.

import 'package:dart_libp2p/p2p/protocol/holepunch/holepunch_service.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/service.dart';
import 'package:dart_libp2p/p2p/protocol/identify/id_service.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';

/// Creates a new holepunch service.
///
/// The Service runs on all hosts that support the DCUtR protocol,
/// no matter if they are behind a NAT / firewall or not.
/// The Service handles DCUtR streams (which are initiated from the node behind
/// a NAT / Firewall once we establish a connection to them through a relay.
///
/// listenAddrs MUST only return public addresses.
Future<HolePunchService> newHolePunchService(
  Host host,
  IDService ids,
  List<MultiAddr> Function() listenAddrs, {
  HolePunchOptions? options,
}) async {
  if (ids == null) {
    throw ArgumentError('identify service can\'t be null');
  }

  final service = HolePunchServiceImpl(host, ids, listenAddrs, options: options);
  await service.start();
  return service;
}
