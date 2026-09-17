import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limit.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scope_impl.dart';

/// TransientScopeImpl is the concrete implementation for the transient scope.
/// It doesn't add specific new behavior beyond the base ResourceScopeImpl
/// but ensures it implements the `ResourceScope` interface.
class TransientScopeImpl extends ResourceScopeImpl {
  /// The transient scope is typically a child of the system scope.
  TransientScopeImpl(Limit limit, String name, {List<ResourceScopeImpl>? edges})
      : super(limit, name, edges: edges);

  // No additional methods needed as ResourceScopeImpl already fulfills ResourceScope.
}
