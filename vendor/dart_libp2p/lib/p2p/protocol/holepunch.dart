/// Package holepunch provides the holepunch service for libp2p.
///
/// The holepunch service provides direct connection establishment capabilities
/// for libp2p nodes behind NATs/firewalls. It coordinates hole punching between
/// peers to establish direct connections.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/holepunch
/// to Dart, using native Dart idioms.

export 'holepunch/filter.dart';
export 'holepunch/holepunch.dart';
export 'holepunch/holepunch_service.dart';
export 'holepunch/holepuncher.dart';
export 'holepunch/metrics.dart';
export 'holepunch/service.dart';
export 'holepunch/tracer.dart';
export 'holepunch/util.dart';