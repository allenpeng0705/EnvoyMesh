/// CertifiedAddrBook manages signed peer records and "self-certified" addresses
/// contained within them.
/// Use this interface with an `AddrBook`.
///
/// To test whether a given AddrBook / Peerstore implementation supports
/// certified addresses, callers should use the GetCertifiedAddrBook helper or
/// type-assert on the CertifiedAddrBook interface:
///
///   if (addrBook is CertifiedAddrBook) {
///     (addrBook as CertifiedAddrBook).consumePeerRecord(signedPeerRecord, ttl);
///   }

import 'dart:async';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/record/envelope.dart';

/// Envelope contains a signed payload produced by a peer.
/// This is a placeholder for the actual Envelope class that would be defined in the record module.
/// When the record module is implemented, this should be replaced with the actual Envelope class.
/// 
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:synchronized/synchronized.dart';


/// CertifiedAddrBook manages signed peer records and "self-certified" addresses
/// contained within them.
abstract class CertifiedAddrBook {
  /// ConsumePeerRecord stores a signed peer record and the contained addresses for
  /// ttl duration.
  /// The addresses contained in the signed peer record will expire after ttl. If any
  /// address is already present in the peer store, it'll expire at max of existing ttl and
  /// provided ttl.
  /// The signed peer record itself will be expired when all the addresses associated with the peer,
  /// self-certified or not, are removed from the AddrBook.
  ///
  /// To delete the signed peer record, use `AddrBook.updateAddrs`,`AddrBook.setAddrs`, or
  /// `AddrBook.clearAddrs` with ttl 0.
  /// Note: Future calls to ConsumePeerRecord will not expire self-certified addresses from the
  /// previous calls.
  ///
  /// The `accepted` return value indicates that the record was successfully processed. If
  /// `accepted` is false but no error is returned, it means that the record was ignored, most
  /// likely because a newer record exists for the same peer with a greater seq value.
  ///
  /// The Envelopes containing the signed peer records can be retrieved by calling
  /// getPeerRecord(peerId).
  Future<bool> consumePeerRecord(Envelope s, Duration ttl);

  /// GetPeerRecord returns an Envelope containing a peer record for the
  /// peer, or null if no record exists.
  Future<Envelope?> getPeerRecord(PeerId p);
}

/// GetCertifiedAddrBook is a helper to "upcast" an AddrBook to a
/// CertifiedAddrBook by using type assertion. If the given AddrBook
/// is also a CertifiedAddrBook, it will be returned, and the ok return
/// value will be true. Returns (null, false) if the AddrBook is not a
/// CertifiedAddrBook.
///
/// Note that since Peerstore embeds the AddrBook interface, you can also
/// call GetCertifiedAddrBook(myPeerstore).
(bool, CertifiedAddrBook?) getCertifiedAddrBook(dynamic ab) {
  if (ab is CertifiedAddrBook) {
    return (true, ab);
  }
  return (false, null);
}