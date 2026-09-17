/// Package protocol provides core interfaces for protocol routing and negotiation in libp2p.
///
/// This file contains the protocol ID type and interfaces for protocol routing and negotiation.

import 'dart:async';
import '../network/stream.dart';

/// ProtocolID is a string identifier for a protocol.
///
/// These are used to identify which protocol to use when communicating with a peer.
/// Protocol IDs are usually path-like, e.g. "/ipfs/kad/1.0.0"
typedef ProtocolID = String;

/// These are reserved protocol IDs.
class ReservedProtocolIDs {
  /// Testing protocol ID
  static const ProtocolID testingID = "/p2p/_testing";
}

/// Utility functions for protocol IDs
class ProtocolIDUtil {
  /// Converts a list of strings to a list of protocol IDs.
  static List<ProtocolID> convertFromStrings(List<String> ids) {
    return ids.map((id) => id ).toList();
  }

  /// Converts a list of protocol IDs to a list of strings.
  static List<String> convertToStrings(List<ProtocolID> ids) {
    return ids.map((id) => id).toList();
  }
}

/// HandlerFunc is a user-provided function used by the Router to
/// handle a protocol/stream.
///
/// Will be invoked with the protocol ID string as the first argument,
/// which may differ from the ID used for registration if the handler
/// was registered using a match function.
typedef HandlerFunc = void Function(ProtocolID protocol, P2PStream<dynamic> stream);

/// Router is an interface that allows users to add and remove protocol handlers,
/// which will be invoked when incoming stream requests for registered protocols
/// are accepted.
///
/// Upon receiving an incoming stream request, the Router will check all registered
/// protocol handlers to determine which (if any) is capable of handling the stream.
/// The handlers are checked in order of registration; if multiple handlers are
/// eligible, only the first to be registered will be invoked.
abstract class Router {
  /// AddHandler registers the given handler to be invoked for
  /// an exact literal match of the given protocol ID string.
  void addHandler(ProtocolID protocol, HandlerFunc handler);

  /// AddHandlerWithFunc registers the given handler to be invoked
  /// when the provided match function returns true.
  ///
  /// The match function will be invoked with an incoming protocol
  /// ID string, and should return true if the handler supports
  /// the protocol. Note that the protocol ID argument is not
  /// used for matching; if you want to match the protocol ID
  /// string exactly, you must check for it in your match function.
  Future<void> addHandlerWithFunc(ProtocolID protocol, bool Function(ProtocolID) match, HandlerFunc handler);

  /// RemoveHandler removes the registered handler (if any) for the
  /// given protocol ID string.
  void removeHandler(ProtocolID protocol);

  /// Protocols returns a list of all registered protocol ID strings.
  /// Note that the Router may be able to handle protocol IDs not
  /// included in this list if handlers were added with match functions
  /// using AddHandlerWithFunc.
  Future<List<ProtocolID>> protocols();
}

/// Negotiator is a component capable of reaching agreement over what protocols
/// to use for inbound streams of communication.
abstract class Negotiator {
  /// Negotiate will return the registered protocol handler to use for a given
  /// inbound stream, returning after the protocol has been determined and the
  /// Negotiator has finished using the stream for negotiation. Returns an
  /// error if negotiation fails.
  Future<(ProtocolID, HandlerFunc)> negotiate(P2PStream<dynamic> stream);

  /// Handle calls Negotiate to determine which protocol handler to use for an
  /// inbound stream, then invokes the protocol handler function, passing it
  /// the protocol ID and the stream. Returns an error if negotiation fails.
  Future<void> handle(P2PStream<dynamic> stream);
}

