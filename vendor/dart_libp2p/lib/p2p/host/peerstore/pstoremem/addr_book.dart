/// AddrBook implementation for the memory-based peerstore.

import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';

import 'package:dart_libp2p/core/certified_addr_book.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/record/envelope.dart';
import 'package:logging/logging.dart';
import 'package:synchronized/synchronized.dart';

import '../../../../core/peer/pb/peer_record.pb.dart';


/// Logger for the address book.
final _log = Logger('peerstore');


class PeerRecordState {
  final Envelope _envelope;
  final int _seq;

  Envelope get envelope => _envelope;
  int get seq => _seq;

  PeerRecordState(this._envelope, this._seq);

}

/// An address with an expiration time.
class ExpiringAddr {
  final MultiAddr addr;
  Duration ttl;
  DateTime expiry;
  final PeerId peer;
  int heapIndex = -1;

  ExpiringAddr({
    required this.addr,
    required this.ttl,
    required this.expiry,
    required this.peer,
  });

  bool expiredBy(DateTime t) {
    return !t.isBefore(expiry);
  }

  bool isConnected() {
    return ttlIsConnected(ttl);
  }
}

/// Returns true if the TTL is at least as long as the connected TTL.
bool ttlIsConnected(Duration ttl) {
  return ttl >= AddressTTL.connectedAddrTTL;
}

/// A collection of peer addresses.
class PeerAddrs {
  final _addrs = HashMap<String, Map<String, ExpiringAddr>>();
  final _expiringHeap = <ExpiringAddr>[];
  final _lock = Lock();

  PeerAddrs();

  int get length => _expiringHeap.length;

  bool get isEmpty => _expiringHeap.isEmpty;

  DateTime nextExpiry() {
    if (_expiringHeap.isEmpty) {
      return DateTime.fromMillisecondsSinceEpoch(0);
    }
    return _expiringHeap[0].expiry;
  }

  void _siftUp(int index) {
    final item = _expiringHeap[index];
    while (index > 0) {
      final parentIndex = (index - 1) ~/ 2;
      final parent = _expiringHeap[parentIndex];
      if (!item.expiry.isBefore(parent.expiry)) {
        break;
      }
      _expiringHeap[parentIndex] = item;
      _expiringHeap[index] = parent;
      item.heapIndex = parentIndex;
      parent.heapIndex = index;
      index = parentIndex;
    }
  }

  void _siftDown(int index) {
    // No change to _siftDown itself, but it relies on correct heap state.
    // Added a defensive check at the start of _siftUpOrDown which calls this.
      final item = _expiringHeap[index];
      final halfLength = _expiringHeap.length ~/ 2;
      while (index < halfLength) {
        var childIndex = 2 * index + 1;
        var child = _expiringHeap[childIndex];
        final rightIndex = childIndex + 1;
        if (rightIndex < _expiringHeap.length) {
          final right = _expiringHeap[rightIndex];
          if (right.expiry.isBefore(child.expiry)) {
            childIndex = rightIndex;
            child = right;
          }
        }
        if (!child.expiry.isBefore(item.expiry)) {
          break;
        }
        _expiringHeap[index] = child;
        _expiringHeap[childIndex] = item;
        item.heapIndex = childIndex;
        child.heapIndex = index;
        index = childIndex;
      }
  }

  // Helper to consolidate sift logic, assuming index is valid for _expiringHeap
  // and heap is not empty when this is called for sifting an element *at* index.
  void _siftUpOrDown(int index) {

      // Defensive check: If heap is empty or index is out of bounds, nothing to sift.
      if (_expiringHeap.isEmpty || index < 0 || index >= _expiringHeap.length) {
        return;
      }

      // Sift up if item at index is smaller than parent
      if (index > 0 && _expiringHeap[index].expiry.isBefore(
          _expiringHeap[(index - 1) ~/ 2].expiry)) {
        _siftUp(index);
      } else {
        // Else, sift down. _siftDown is safe for heap of size 1 (index 0, halfLength 0, loop doesn't run)
        _siftDown(index);
      }
  }

  Future<void> push(ExpiringAddr a) async {

    return await _lock.synchronized(() async {
      a.heapIndex = _expiringHeap.length;
      _expiringHeap.add(a);
      _siftUp(a.heapIndex);
    });
  }

  Future<ExpiringAddr> pop() async {
    return await _lock.synchronized(() async {
      if (_expiringHeap.isEmpty) {
        // Should not happen if called correctly, but defensive.
        throw StateError("Cannot pop from an empty heap");
      }
      final ExpiringAddr result = _expiringHeap[0];

      if (_expiringHeap.length == 1) {
        _expiringHeap.removeLast();
      } else {
        final ExpiringAddr last = _expiringHeap.removeLast();
        _expiringHeap[0] = last;
        last.heapIndex = 0;
        _siftDown(0); // _siftDown is safe for heap of size 1 (now at index 0)
      }

      result.heapIndex = -1; // Mark as removed from heap
      return result;
    });
  }

  Future<void> remove(int index) async {

    return await _lock.synchronized(() async {
      if (index < 0 || index >= _expiringHeap.length) {
        // Invalid index or empty heap if length is 0
        return;
      }

      final ExpiringAddr itemToRemove = _expiringHeap[index];

      final int lastIndex = _expiringHeap.length - 1;
      if (index == lastIndex) {
        // Removing the last element, just pop it.
        _expiringHeap.removeLast();
      } else {
        // Not the last element. Swap with the last, then sift.
        final ExpiringAddr lastItem = _expiringHeap
            .removeLast(); // Get last and shrink heap.
        _expiringHeap[index] = lastItem; // Place lastItem at 'index'.
        lastItem.heapIndex = index; // Update lastItem's heapIndex.
        _siftUpOrDown(index); // Re-heapify the element now at 'index'.
      }

      itemToRemove.heapIndex =
      -1; // Crucial: mark the targeted item as out of heap.
    });
  }

  Future<void> delete(ExpiringAddr a) async {
    await _lock.synchronized(() async {
      final peerKey = a.peer.toString();
      final addrKey = a.addr.toString();

      if (_addrs.containsKey(peerKey) &&
          _addrs[peerKey]!.containsKey(addrKey)) {
        final ea = _addrs[peerKey]![addrKey]!;
        if (ea.heapIndex != -1) {
          remove(ea.heapIndex);
        }
        _addrs[peerKey]!.remove(addrKey);
        if (_addrs[peerKey]!.isEmpty) {
          _addrs.remove(peerKey);
        }
      }
    });
  }

  Future<ExpiringAddr?> findAddr(PeerId p, MultiAddr addr) async {
    return await _lock.synchronized(() async {
      final peerKey = p.toString();
      final addrKey = addr.toString();

      if (_addrs.containsKey(peerKey)) {
        return _addrs[peerKey]![addrKey];
      }
      return null;
    });
  }

  // Unlocked version for internal use when already holding MemoryAddrBook._lock
  ExpiringAddr? _findAddrUnlocked(PeerId p, MultiAddr addr) {
    final peerKey = p.toString();
    final addrKey = addr.toString();

    if (_addrs.containsKey(peerKey)) {
      return _addrs[peerKey]![addrKey];
    }
    return null;
  }

  Future<ExpiringAddr?> popIfExpired(DateTime now) async {

    return await _lock.synchronized(() async {
      if (_expiringHeap.isNotEmpty && !now.isBefore(nextExpiry())) {
        final ea = await pop();
        final peerKey = ea.peer.toString();
        final addrKey = ea.addr.toString();

        if (_addrs.containsKey(peerKey)) {
          _addrs[peerKey]!.remove(addrKey);
          if (_addrs[peerKey]!.isEmpty) {
            _addrs.remove(peerKey);
          }
        }

        return ea;
      }
      return null;
    });
  }

  Future<void> update(ExpiringAddr a) async {
    await _lock.synchronized(() async {
      if (a.heapIndex == -1) {
        return;
      }
      if (a.isConnected()) {
        remove(a.heapIndex);
      } else {
        _siftDown(a.heapIndex);
        _siftUp(a.heapIndex);
      }
    });

  }

  // Unlocked version for internal use when already holding MemoryAddrBook._lock
  void _updateUnlocked(ExpiringAddr a) {
    if (a.heapIndex == -1) {
      return;
    }
    if (a.isConnected()) {
      remove(a.heapIndex);
    } else {
      _siftDown(a.heapIndex);
      _siftUp(a.heapIndex);
    }
  }

  Future<void> insert(ExpiringAddr a) async {

    await _lock.synchronized(() async {
      a.heapIndex = -1;
      final peerKey = a.peer.toString();
      final addrKey = a.addr.toString();

      if (!_addrs.containsKey(peerKey)) {
        _addrs[peerKey] = <String, ExpiringAddr>{};
      }
      _addrs[peerKey]![addrKey] = a;

      // Don't add connected addr to heap
      if (a.isConnected()) {
        return;
      }
      push(a);
    });
  }

  // Unlocked version for internal use when already holding MemoryAddrBook._lock
  void _insertUnlocked(ExpiringAddr a) {
    a.heapIndex = -1;
    final peerKey = a.peer.toString();
    final addrKey = a.addr.toString();

    if (!_addrs.containsKey(peerKey)) {
      _addrs[peerKey] = <String, ExpiringAddr>{};
    }
    _addrs[peerKey]![addrKey] = a;

    // Don't add connected addr to heap
    if (a.isConnected()) {
      return;
    }
    push(a);
  }

  int numUnconnectedAddrs() {
    return _expiringHeap.length;
  }

  Future<List> getKeys() async {
    return await _lock.synchronized(() async {
      return _addrs.keys.toList();
    });
  }

  Future<bool> containsKey(String peerKey) async {
    return await _lock.synchronized(() async {
      final result = _addrs.containsKey(peerKey);
      return result;
    });

  }

  Future<List<ExpiringAddr>?> getPeerKeyValues(String peerKey) async {
    return await _lock.synchronized(() async {
      return _addrs[peerKey]?.values.toList();
    });

  }

  Future<Map<String, ExpiringAddr>?> getPeerKeys(String peerKey) async {
    return await _lock.synchronized(() async {
      final result = _addrs[peerKey];
      return result;
    });
  }

  // Unlocked version for internal use when already holding MemoryAddrBook._lock
  bool _containsKeyUnlocked(String peerKey) {
    final result = _addrs.containsKey(peerKey);
    return result;
  }

  // Unlocked version for internal use when already holding MemoryAddrBook._lock
  Map<String, ExpiringAddr>? _getPeerKeysUnlocked(String peerKey) {
    final result = _addrs[peerKey];
    return result;
  }

  // for (final a in _addrs.addrs[peerKey]!.values) {

  // Map<String, Map<String, ExpiringAddr>> get addrs => _addrs;
}

/// A subscription to address updates.
class AddrSub {
  final StreamController<MultiAddr> _controller = StreamController<MultiAddr>();
  final Set<String> _sent = <String>{};

  Stream<MultiAddr> get stream => _controller.stream;

  void pubAddr(MultiAddr addr) {
    final addrKey = addr.toString();
    if (_sent.contains(addrKey)) {
      return;
    }
    _sent.add(addrKey);
    _controller.add(addr);
  }

  void close() {
    _controller.close();
  }
}

/// A manager for address subscriptions.
class AddrSubManager {
  final _subs = HashMap<String, List<AddrSub>>();
  final _lock = Lock();

  AddrSubManager();

  Future<void> removeSub(PeerId p, AddrSub s) async {
    await _lock.synchronized( ()async {
      final peerKey = p.toString();
      final subs = _subs[peerKey];
      if (subs == null || subs.isEmpty) {
        return;
      }

      if (subs.length == 1) {
        if (subs[0] != s) {
          return;
        }
        _subs.remove(peerKey);
        return;
      }

      final index = subs.indexOf(s);
      if (index != -1) {
        subs.removeAt(index);
      }
    });
  }

  Future<void> broadcastAddr(PeerId p, MultiAddr addr) async {
    await _lock.synchronized( () async {
      final peerKey = p.toString();
      final subs = _subs[peerKey];
      if (subs == null) {
        return;
      }

      for (final sub in subs) {
        sub.pubAddr(addr);
      }
    });
  }

  Future<Stream<MultiAddr>> addrStream(PeerId p, List<MultiAddr> initial) async {
    final sub = AddrSub();

    await _lock.synchronized( () async {
      final peerKey = p.toString();
      if (!_subs.containsKey(peerKey)) {
        _subs[peerKey] = <AddrSub>[];
      }
      _subs[peerKey]!.add(sub);
    });

    // Send initial addresses
    for (final addr in initial) {
      sub.pubAddr(addr);
    }

    return sub.stream;
  }
}


const defaultMaxSignedPeerRecords = 100000;
const defaultMaxUnconnectedAddrs  = 1000000;


/// A memory-based implementation of the AddrBook interface.
class MemoryAddrBook implements AddrBook, CertifiedAddrBook {
  final PeerAddrs _addrs = PeerAddrs();
  final _lock = Lock();
  final AddrSubManager _subManager = AddrSubManager();
  final int _maxUnconnectedAddrs;
  Map<PeerId, PeerRecordState> _signedPeerRecords = {};

  var maxUnconnectedAddrs  = defaultMaxUnconnectedAddrs;
  var maxSignedPeerRecords = defaultMaxSignedPeerRecords;

  /// Creates a new memory-based address book implementation.
  MemoryAddrBook({int maxUnconnectedAddrs = 1000000}) : _maxUnconnectedAddrs = maxUnconnectedAddrs;

  @override
  Future<void> addAddr(PeerId p, MultiAddr addr, Duration ttl) async {
    await _lock.synchronized( () async {
      await _addAddrs(p, [addr], ttl);  // FIXED: Call unlocked version to avoid nested deadlock!
    });
  }

  @override
  Future<void> addAddrs(PeerId p, List<MultiAddr> addrs, Duration ttl) async {
    await _lock.synchronized(() async {
      await _addAddrs(p, addrs, ttl);
    });
  }

  Future<void> _addAddrs(PeerId p, List<MultiAddr> addrs, Duration ttl) async {
    await _addAddrsUnlocked(p, addrs, ttl);  // FIXED: Added missing await!
  }

  Future<void> _addAddrsUnlocked(PeerId p, List<MultiAddr> addrs, Duration ttl) async {

    // If ttl is zero, exit. nothing to do.
    if (ttl <= Duration.zero) {
      return;
    }

    // We are over limit, drop these addrs.
    if (!ttlIsConnected(ttl) && _addrs.numUnconnectedAddrs() >= _maxUnconnectedAddrs) {
      return;
    }

    final exp = DateTime.now().add(ttl);
    
    for (int i = 0; i < addrs.length; i++) {
      final addr = addrs[i];

      final a = _addrs._findAddrUnlocked(p, addr);

      if (a == null) {
        // Not found, announce it.
        final entry = ExpiringAddr(addr: addr, expiry: exp, ttl: ttl, peer: p);
        
        _addrs._insertUnlocked(entry);

        _subManager.broadcastAddr(p, addr);
      } else {
        // Update ttl & exp to whichever is greater between new and existing entry
        var changed = false;
        if (ttl > a.ttl) {
          changed = true;
          a.ttl = ttl;
        }
        if (exp.isAfter(a.expiry)) {
          changed = true;
          a.expiry = exp;
        }
        if (changed) {
          _addrs._updateUnlocked(a);
        }
      }
    }
  }

  @override
  Future<void> setAddr(PeerId p, MultiAddr addr, Duration ttl) async {
    await setAddrs(p, [addr], ttl);
  }

  @override
  Future<void> setAddrs(PeerId p, List<MultiAddr> addrs, Duration ttl) async {
    // await _lock.synchronized( () async {
      final exp = DateTime.now().add(ttl);
      for (final addr in addrs) {
        // TODO: Handle peer ID in multiaddr

        final a = await _addrs.findAddr(p, addr);
        if (a != null) {
          if (ttl > Duration.zero) {
            if (a.isConnected() && !ttlIsConnected(ttl) && _addrs.numUnconnectedAddrs() >= _maxUnconnectedAddrs) {
              await _addrs.delete(a);
            } else {
              a.expiry = exp;
              a.ttl = ttl;
              await _addrs.update(a);
              _subManager.broadcastAddr(p, addr);
            }
          } else {
            await _addrs.delete(a);
          }
        } else {
          if (ttl > Duration.zero) {
            if (!ttlIsConnected(ttl) && _addrs.numUnconnectedAddrs() >= _maxUnconnectedAddrs) {
              continue;
            }
            final entry = ExpiringAddr(addr: addr, expiry: exp, ttl: ttl, peer: p);
            await _addrs.insert(entry);
            _subManager.broadcastAddr(p, addr);
          }
        }
      }
    // });
  }

  @override
  Future<void> updateAddrs(PeerId p, Duration oldTTL, Duration newTTL) async {
    // await _lock.synchronized(() async {
      final peerKey = p.toString();
      if (!await _addrs.containsKey(peerKey)) {
        return;
      }

      final exp = DateTime.now().add(newTTL);
      final peerkeyValues = await _addrs.getPeerKeyValues(peerKey);
      for (final a in peerkeyValues!) {
        if (a.ttl == oldTTL) {
          if (newTTL == Duration.zero) {
            await _addrs.delete(a);
          } else {
            // We are over limit, drop these addresses.
            if (ttlIsConnected(oldTTL) && !ttlIsConnected(newTTL) && _addrs.numUnconnectedAddrs() >= _maxUnconnectedAddrs) {
              await _addrs.delete(a);
            } else {
              a.ttl = newTTL;
              a.expiry = exp;
              await _addrs.update(a);
            }
          }
        }
      }
    // });
  }

  @override
  Future<List<MultiAddr>> addrs(PeerId p) async {
    return await _lock.synchronized(() async {
      final peerKey = p.toString();
      if (!_addrs._containsKeyUnlocked(peerKey)) {
        return <MultiAddr>[];
      }
      final peerKeys = _addrs._getPeerKeysUnlocked(peerKey);
      return _validAddrs(DateTime.now(), peerKeys!);
    });
  }

  List<MultiAddr> _validAddrs(DateTime now, Map<String, ExpiringAddr> amap) {
    final good = <MultiAddr>[];
    if (amap.isEmpty) {
      return good;
    }
    for (final m in amap.values) {
      if (!m.expiredBy(now)) {
        good.add(m.addr);
      }
    }
    return good;
  }

  @override
  Future<Stream<MultiAddr>> addrStream(PeerId id) async {
    final initial = <MultiAddr>[];

    await _lock.synchronized(() async {
      final peerKey = id.toString();
      if (await _addrs.containsKey(peerKey)) {
        final peerKeys = await _addrs.getPeerKeys(peerKey);
        for (final a in await peerKeys!.values) {
          initial.add(a.addr);
        }
      }
    });

    return _subManager.addrStream(id, initial);
  }

  @override
  Future<void> clearAddrs(PeerId p) async {
    await _lock.synchronized(() async {
      final peerKey = p.toString();
      if (!await _addrs.containsKey(peerKey)) {
        return;
      }

      final peerKeys = await _addrs.getPeerKeys(peerKey);
      final addrsCopy = List<ExpiringAddr>.from(peerKeys!.values);
      for (final a in addrsCopy) {
        await _addrs.delete(a);
      }
    });
  }

  @override
  Future<List<PeerId>> peersWithAddrs() async {
    return _lock.synchronized(() async {
      final peers = <PeerId>[];
      final keyList = await _addrs.getKeys();
      for (final peerKey in keyList) {
        peers.add(PeerId.fromString(peerKey));
      }
      return peers;
    });
  }


  @override
  Future<bool> consumePeerRecord(Envelope recordEnvelope, Duration ttl) async {
    return await _lock.synchronized(() async {
      try {
        final r = await recordEnvelope.record();
        final rec = r as PeerRecord;
        final pId = PeerId.fromBytes(Uint8List.fromList(rec.peerId));

        final pubKey = await pId.extractPublicKey();
        final pubkeyEquals = await pubKey?.equals(recordEnvelope.publicKey) ;
        if (pubkeyEquals != null && !pubkeyEquals) {
          throw Exception('signing key does not match PeerID in PeerRecord');
        }

        // ensure seq is greater than or equal to the last received
        final lastState = _signedPeerRecords[rec.peerId];
        if (lastState != null && lastState.seq > rec.seq.toInt()) {
          return false;
        }
        
        // check if we are over the max signed peer record limit
        if (lastState == null && _signedPeerRecords.length >= maxSignedPeerRecords) {
          throw Exception('too many signed peer records');
        }
        
        _signedPeerRecords[pId] = PeerRecordState(
          recordEnvelope,
          rec.seq.toInt()
        );

        final List<MultiAddr> addrs = rec.addresses.map((e) => MultiAddr.fromBytes(Uint8List.fromList(e.multiaddr))).toList();
        _addAddrsUnlocked(pId, addrs, ttl);
        return true;
      } on TypeError {
        throw Exception('unable to process envelope: not a PeerRecord');
      }
    });
  }


  @override
  Future<Envelope?> getPeerRecord(PeerId p) async {

    return await _lock.synchronized(() async {
      final peerKey = p.toString();
      if (! await _addrs.containsKey(peerKey)) {
        return null;
      }
      // The record may have expired, but not garbage collected.
      final adresses = await _addrs.getPeerKeys(peerKey);
      if (_validAddrs(DateTime.now(), adresses!).isEmpty) {
        return null;
      }

      final state = _signedPeerRecords[p];
      if (state == null) {
        return null;
      }
      return state.envelope;
    });
  }
}
   
/// Creates a new memory-based address book implementation.
MemoryAddrBook newAddrBook({int maxUnconnectedAddrs = 1000000}) {
  return MemoryAddrBook(maxUnconnectedAddrs: maxUnconnectedAddrs);
}
