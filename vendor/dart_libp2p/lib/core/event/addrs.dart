/// Address-related events for libp2p.
///
/// This is a port of the Go implementation from go-libp2p/core/event/addrs.go
/// to Dart, using native Dart idioms.

import '../multiaddr.dart';

/// AddrAction represents an action taken on one of a Host's listen addresses.
/// It is used to add context to address change events in EvtLocalAddressesUpdated.
enum AddrAction {
  /// Unknown means that the event producer was unable to determine why the address
  /// is in the current state.
  unknown,

  /// Added means that the address is new and was not present prior to the event.
  added,

  /// Maintained means that the address was not altered between the current and
  /// previous states.
  maintained,

  /// Removed means that the address was removed from the Host.
  removed,
}

/// UpdatedAddress is used in the EvtLocalAddressesUpdated event to convey
/// address change information.
class UpdatedAddress {
  /// Address contains the address that was updated.
  final MultiAddr address;

  /// Action indicates what action was taken on the address during the
  /// event. May be Unknown if the event producer cannot produce diffs.
  final AddrAction action;

  /// Creates a new UpdatedAddress.
  UpdatedAddress({
    required this.address,
    required this.action,
  });
}

/// EvtLocalAddressesUpdated should be emitted when the set of listen addresses for
/// the local host changes. This may happen for a number of reasons. For example,
/// we may have opened a new relay connection, established a new NAT mapping via
/// UPnP, or been informed of our observed address by another peer.
///
/// EvtLocalAddressesUpdated contains a snapshot of the current listen addresses,
/// and may also contain a diff between the current state and the previous state.
/// If the event producer is capable of creating a diff, the Diffs field will be
/// true, and event consumers can inspect the Action field of each UpdatedAddress
/// to see how each address was modified.
///
/// For example, the Action will tell you whether an address in
/// the Current list was Added by the event producer, or was Maintained without
/// changes. Addresses that were removed from the Host will have the AddrAction
/// of Removed, and will be in the Removed list.
///
/// If the event producer is not capable or producing diffs, the Diffs field will
/// be false, the Removed list will always be empty, and the Action for each
/// UpdatedAddress in the Current list will be Unknown.
///
/// In addition to the above, EvtLocalAddressesUpdated also contains the updated peer.PeerRecord
/// for the Current set of listen addresses, wrapped in a record.Envelope and signed by the Host's private key.
/// This record can be shared with other peers to inform them of what we believe are our diallable addresses
/// a secure and authenticated way.
class EvtLocalAddressesUpdated {
  /// Diffs indicates whether this event contains a diff of the Host's previous
  /// address set.
  final bool diffs;

  /// Current contains all current listen addresses for the Host.
  /// If Diffs == true, the Action field of each UpdatedAddress will tell
  /// you whether an address was Added, or was Maintained from the previous
  /// state.
  final List<UpdatedAddress> current;

  /// Removed contains addresses that were removed from the Host.
  /// This field is only set when Diffs == true.
  final List<UpdatedAddress> removed;

  /// SignedPeerRecord contains our own updated peer.PeerRecord, listing the addresses enumerated in Current,
  /// wrapped in a record.Envelope and signed by the Host's private key.
  /// 
  /// Note: In the Dart implementation, we're using a dynamic type for now as the record.Envelope
  /// type is not yet defined. This should be updated when the record package is implemented.
  final dynamic signedPeerRecord;


  @override
  String toString() {
    return "EvtLocalAddressesUpdated";
  }

  /// Creates a new EvtLocalAddressesUpdated event.
  EvtLocalAddressesUpdated({
    required this.diffs,
    required this.current,
    this.removed = const [],
    this.signedPeerRecord,
  });
}