import 'dart:async';

import 'package:dart_libp2p/core/peer/peer_id.dart';

import 'conn_manager.dart';

/// A decaying tag is one whose value automatically decays over time.
///
/// The actual application of the decay behaviour is encapsulated in a
/// user-provided decaying function (DecayFn). The function is called on every
/// tick (determined by the interval parameter), and returns either the new value
/// of the tag, or whether it should be erased altogether.
///
/// We do not set values on a decaying tag. Rather, we "bump" decaying tags by a
/// delta. This calls the BumpFn with the old value and the delta, to determine
/// the new value.
///
/// Such a pluggable design affords a great deal of flexibility and versatility.
/// Behaviours that are straightforward to implement include:
///
///   - Decay a tag by -1, or by half its current value, on every tick.
///   - Every time a value is bumped, sum it to its current value.
///   - Exponentially boost a score with every bump.
///   - Sum the incoming score, but keep it within min, max bounds.

/// Represents a value for a decaying tag.
class DecayingValue {
  /// Tag points to the tag this value belongs to.
  final DecayingTag tag;

  /// Peer is the peer ID to whom this value is associated.
  final PeerId peer;

  /// Added is the timestamp when this value was added for the first time for
  /// a tag and a peer.
  final DateTime added;

  /// LastVisit is the timestamp of the last visit.
  final DateTime lastVisit;

  /// Value is the current value of the tag.
  final int value;

  DecayingValue({
    required this.tag,
    required this.peer,
    DateTime? added,
    DateTime? lastVisit,
    this.value = 0,
  })  : added = added ?? DateTime.now(),
        lastVisit = lastVisit ?? DateTime.now();
}

/// DecayFn applies a decay to the peer's score. The implementation must call
/// DecayFn at the interval supplied when registering the tag.
///
/// It receives a copy of the decaying value, and returns the score after
/// applying the decay, as well as a flag to signal if the tag should be erased.
typedef DecayFn = (int, bool) Function(DecayingValue value);

/// BumpFn applies a delta onto an existing score, and returns the new score.
///
/// Non-trivial bump functions include exponential boosting, moving averages,
/// ceilings, etc.
typedef BumpFn = int Function(DecayingValue value, int delta);

/// Represents a decaying tag. The tag is a long-lived general
/// object, used to operate on tag values for peers.
abstract class DecayingTag {
  /// Returns the name of the tag.
  String get name;

  /// Interval is the effective interval at which this tag will tick. Upon
  /// registration, the desired interval may be overwritten depending on the
  /// decayer's resolution, and this method allows you to obtain the effective
  /// interval.
  Duration get interval;

  /// Bump applies a delta to a tag value, calling its bump function. The bump
  /// will be applied asynchronously, and a non-null error indicates a fault
  /// when queuing.
  Future<void> bump(PeerId peer, int delta);

  /// Remove removes a decaying tag from a peer. The removal will be applied
  /// asynchronously, and a non-null error indicates a fault when queuing.
  Future<void> remove(PeerId peer);

  /// Close closes a decaying tag. The Decayer will stop tracking this tag,
  /// and the state of all peers in the Connection Manager holding this tag
  /// will be updated.
  ///
  /// The deletion is performed asynchronously.
  ///
  /// Once deleted, a tag should not be used, and further calls to bump/remove
  /// will error.
  Future<void> close();
}

/// Decayer is implemented by connection managers supporting decaying tags.
abstract class Decayer {
  /// Creates and registers a new decaying tag, if and only
  /// if a tag with the supplied name doesn't exist yet. Otherwise, an error is
  /// thrown.
  ///
  /// The caller provides the interval at which the tag is refreshed, as well
  /// as the decay function and the bump function.
  Future<DecayingTag> registerDecayingTag(
    String name,
    Duration interval,
    DecayFn decayFn,
    BumpFn bumpFn,
  );

  /// Closes the decayer and stops background processes.
  Future<void> close();
}

/// Common decay functions

/// Applies no decay.
DecayFn decayNone() {
  return (value) => (value.value, false);
}

/// Subtracts from by the provided minuend, and deletes the tag when
/// first reaching 0 or negative.
DecayFn decayFixed(int minuend) {
  return (value) {
    final v = value.value - minuend;
    return (v, v <= 0);
  };
}

/// Applies a fractional coefficient to the value of the current tag,
/// rounding down. It erases the tag when the result is zero.
DecayFn decayLinear(double coef) {
  return (value) {
    final v = (value.value * coef).floor();
    return (v, v <= 0);
  };
}

/// Expires a tag after a certain period of no bumps.
DecayFn decayExpireWhenInactive(Duration after) {
  return (value) {
    final now = DateTime.now();
    final rm = now.difference(value.lastVisit) >= after;
    return (0, rm);
  };
}

/// Common bump functions

/// Adds the incoming value to the peer's score.
BumpFn bumpSumUnbounded() {
  return (value, delta) => value.value + delta;
}

/// Keeps summing the incoming score, keeping it within a
/// [min, max] range.
BumpFn bumpSumBounded(int min, int max) {
  return (value, delta) {
    final v = value.value + delta;
    if (v >= max) {
      return max;
    } else if (v <= min) {
      return min;
    }
    return v;
  };
}

/// Replaces the current value of the tag with the incoming one.
BumpFn bumpOverwrite() {
  return (value, delta) => delta;
}