/// Options for routing operations.
///
/// This file is ported from go-libp2p/core/routing/options.go

/// A function that modifies routing options.
typedef Option = Function(RoutingOptions options);

/// Options for routing operations.
class RoutingOptions {
  /// Allow expired values.
  bool expired = false;

  /// Operate in offline mode (rely on cached/local data only).
  bool offline = false;

  /// Other (ValueStore implementation specific) options.
  Map<dynamic, dynamic>? other;

  /// Apply the given options to this Options instance.
  void apply(List<Option> options) {
    for (var option in options) {
      option(this);
    }
  }

  /// Convert this Options to a single Option function.
  Option toOption() {
    return (RoutingOptions opts) {
      opts.expired = expired;
      opts.offline = offline;
      
      if (other != null) {
        opts.other = Map<dynamic, dynamic>.from(other!);
      }
    };
  }
}

/// An option that tells the routing system to return expired records
/// when no newer records are known.
Option expired = (RoutingOptions opts) {
  opts.expired = true;
};

/// An option that tells the routing system to operate offline
/// (i.e., rely on cached/local data only).
Option offline = (RoutingOptions opts) {
  opts.offline = true;
};