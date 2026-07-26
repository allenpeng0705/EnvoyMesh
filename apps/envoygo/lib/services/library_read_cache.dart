/// Shared library-read / media cache for EnvoyGo.
///
/// Mirrors Social `library-read-blob-cache.ts`: memory LRU + etag revalidate,
/// plus on-disk persistence under the app databases directory so Feed / Browser
/// photos survive scroll-away and app restarts (fewer WS round-trips).
library library_read_cache;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart' show getDatabasesPath;

import 'library_read_fetch.dart';

const maxLibraryReadCacheEntries = 64;
const libraryReadCacheFreshTtl = Duration(seconds: 60);
const maxLibraryReadDiskBytes = 80 * 1024 * 1024;

String libraryReadCacheKey(String ownerId, String path) =>
    '${ownerId.trim()}\u0000${path.replaceFirst(RegExp(r'^/+'), '').trim()}';

/// Vault blobs are home-scoped — same relative path on two paired homes must not collide.
String vaultCacheKey(String homeNodeId, String relativePath) =>
    'vault\u0000${homeNodeId.trim()}\u0000${relativePath.replaceFirst(RegExp(r'^/+'), '').trim()}';

String peerThumbCacheKey(String ownerId) => 'thumb\u0000${ownerId.trim()}';

/// How long vault / chat-audio blobs may be served without re-fetch.
const vaultCacheFreshTtl = Duration(minutes: 5);

String _fileIdForKey(String key) => sha256.convert(utf8.encode(key)).toString();

class LibraryReadCacheEntry extends BrowserFetchCacheEntry {
  final DateTime cachedAt;
  final Uint8List? bytes;

  const LibraryReadCacheEntry({
    required super.body,
    required super.contentType,
    required super.contentHash,
    required super.etag,
    required super.byteLength,
    required super.isText,
    required this.cachedAt,
    this.bytes,
  });

  BrowserFetchCacheEntry get asFetchCache => BrowserFetchCacheEntry(
        body: body,
        contentType: contentType,
        contentHash: contentHash,
        etag: etag,
        byteLength: byteLength,
        isText: isText,
      );
}

class LibraryReadCachedResult extends BrowserFetchResult {
  final Uint8List? bytes;

  const LibraryReadCachedResult({
    required super.status,
    super.body,
    super.contentType,
    super.contentHash,
    super.etag,
    super.byteLength,
    super.isText = false,
    super.error,
    super.fromCache = false,
    this.bytes,
  });
}

class _MemRow {
  LibraryReadCacheEntry entry;
  int touch;

  _MemRow({required this.entry, required this.touch});
}

/// Process-wide cache (tests can construct isolated instances).
class LibraryReadCache {
  LibraryReadCache({
    Directory? root,
    DateTime Function()? clock,
    this.maxEntries = maxLibraryReadCacheEntries,
    this.freshTtl = libraryReadCacheFreshTtl,
    this.maxDiskBytes = maxLibraryReadDiskBytes,
  })  : _rootOverride = root,
        _clock = clock ?? DateTime.now;

  static final LibraryReadCache instance = LibraryReadCache();

  final Directory? _rootOverride;
  final DateTime Function() _clock;
  final int maxEntries;
  final Duration freshTtl;
  final int maxDiskBytes;

  final Map<String, _MemRow> _mem = {};
  int _touchSeq = 0;
  Directory? _dir;
  final Map<String, Future<LibraryReadCachedResult>> _inflight = {};

  @visibleForTesting
  int get memorySize => _mem.length;

  Future<Directory> _ensureDir() async {
    if (_dir != null) return _dir!;
    final base = _rootOverride ??
        Directory(p.join(await getDatabasesPath(), 'library-read-cache'));
    if (!await base.exists()) {
      await base.create(recursive: true);
    }
    _dir = base;
    return base;
  }

  void _touch(String key, _MemRow row) {
    row.touch = ++_touchSeq;
    _mem[key] = row;
  }

  void _evictMemoryIfNeeded() {
    while (_mem.length > maxEntries) {
      String? oldestKey;
      var oldestTouch = 1 << 62;
      for (final e in _mem.entries) {
        if (e.value.touch < oldestTouch) {
          oldestTouch = e.value.touch;
          oldestKey = e.key;
        }
      }
      if (oldestKey == null) break;
      _mem.remove(oldestKey);
    }
  }

  Future<void> _writeDisk(String key, LibraryReadCacheEntry entry) async {
    final dir = await _ensureDir();
    final id = _fileIdForKey(key);
    final metaPath = p.join(dir.path, '$id.json');
    final binPath = p.join(dir.path, '$id.bin');
    final raw = entry.bytes ??
        (entry.isText
            ? Uint8List.fromList(utf8.encode(entry.body))
            : base64Decode(entry.body));
    final meta = <String, dynamic>{
      'key': key,
      'contentType': entry.contentType,
      'contentHash': entry.contentHash,
      'etag': entry.etag,
      'byteLength': entry.byteLength,
      'isText': entry.isText,
      'cachedAt': entry.cachedAt.toUtc().toIso8601String(),
      'bodyLen': raw.length,
    };
    await File(binPath).writeAsBytes(raw, flush: true);
    await File(metaPath).writeAsString(jsonEncode(meta), flush: true);
    await _pruneDiskIfNeeded(dir);
  }

  Future<void> _pruneDiskIfNeeded(Directory dir) async {
    final metas = <File>[];
    await for (final ent in dir.list()) {
      if (ent is File && ent.path.endsWith('.json')) metas.add(ent);
    }
    if (metas.isEmpty) return;

    final rows = <({File meta, File bin, DateTime at, int size})>[];
    var total = 0;
    for (final meta in metas) {
      try {
        final map = jsonDecode(await meta.readAsString()) as Map<String, dynamic>;
        final at = DateTime.tryParse(map['cachedAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0);
        final bin = File(meta.path.replaceFirst(RegExp(r'\.json$'), '.bin'));
        final size = await bin.exists() ? await bin.length() : 0;
        total += size;
        rows.add((meta: meta, bin: bin, at: at, size: size));
      } catch (_) {
        /* skip corrupt */
      }
    }
    rows.sort((a, b) => a.at.compareTo(b.at));
    while (rows.length > maxEntries || total > maxDiskBytes) {
      if (rows.isEmpty) break;
      final doomed = rows.removeAt(0);
      total -= doomed.size;
      try {
        if (await doomed.meta.exists()) await doomed.meta.delete();
        if (await doomed.bin.exists()) await doomed.bin.delete();
      } catch (_) {
        /* best-effort */
      }
    }
  }

  Future<LibraryReadCacheEntry?> _readDisk(String key) async {
    final dir = await _ensureDir();
    final id = _fileIdForKey(key);
    final metaFile = File(p.join(dir.path, '$id.json'));
    final binFile = File(p.join(dir.path, '$id.bin'));
    if (!await metaFile.exists() || !await binFile.exists()) return null;
    try {
      final map = jsonDecode(await metaFile.readAsString()) as Map<String, dynamic>;
      final raw = await binFile.readAsBytes();
      final isText = map['isText'] == true;
      final contentType =
          (map['contentType'] as String?) ?? 'application/octet-stream';
      final contentHash = (map['contentHash'] as String?) ?? '';
      final etag = (map['etag'] as String?) ?? contentHash;
      final cachedAt = DateTime.tryParse(map['cachedAt'] as String? ?? '') ??
          _clock().toUtc();
      final body = isText ? utf8.decode(raw) : base64Encode(raw);
      return LibraryReadCacheEntry(
        body: body,
        contentType: contentType,
        contentHash: contentHash,
        etag: etag,
        byteLength: (map['byteLength'] as num?)?.toInt() ?? raw.length,
        isText: isText,
        cachedAt: cachedAt,
        bytes: isText ? null : Uint8List.fromList(raw),
      );
    } catch (_) {
      return null;
    }
  }

  Future<LibraryReadCacheEntry?> _getEntry(String key) async {
    final mem = _mem[key];
    if (mem != null) {
      _touch(key, mem);
      return mem.entry;
    }
    final disk = await _readDisk(key);
    if (disk == null) return null;
    _touch(key, _MemRow(entry: disk, touch: 0));
    _evictMemoryIfNeeded();
    return disk;
  }

  Future<void> _putEntry(String key, BrowserFetchResult result) async {
    if (result.status != 'ok' ||
        result.body == null ||
        result.contentType == null) {
      return;
    }
    final isText = result.isText;
    final contentHash = result.contentHash ?? '';
    final etag = result.etag ??
        (contentHash.isNotEmpty
            ? contentHash.substring(0, contentHash.length > 16 ? 16 : contentHash.length)
            : '');
    Uint8List? bytes;
    if (!isText) {
      try {
        bytes = base64Decode(result.body!);
      } catch (_) {
        bytes = null;
      }
    }
    final entry = LibraryReadCacheEntry(
      body: result.body!,
      contentType: result.contentType!,
      contentHash: contentHash,
      etag: etag.isNotEmpty ? etag : 'none',
      byteLength: result.byteLength ?? result.body!.length,
      isText: isText,
      cachedAt: _clock().toUtc(),
      bytes: bytes,
    );
    _touch(key, _MemRow(entry: entry, touch: 0));
    _evictMemoryIfNeeded();
    await _writeDisk(key, entry);
  }

  /// Peek decoded image/file bytes without network.
  Future<Uint8List?> peekBytes(String ownerId, String path) async {
    final entry = await _getEntry(libraryReadCacheKey(ownerId, path));
    if (entry == null) return null;
    if (entry.bytes != null) return entry.bytes;
    if (entry.isText) return Uint8List.fromList(utf8.encode(entry.body));
    try {
      return base64Decode(entry.body);
    } catch (_) {
      return null;
    }
  }

  /// Generic blob put (vault previews, peer thumbs).
  Future<void> putBlob(
    String key,
    Uint8List bytes, {
    String contentType = 'application/octet-stream',
  }) async {
    final digest = sha256.convert(bytes).toString();
    final entry = LibraryReadCacheEntry(
      body: base64Encode(bytes),
      contentType: contentType,
      contentHash: digest,
      etag: digest.substring(0, 16),
      byteLength: bytes.length,
      isText: false,
      cachedAt: _clock().toUtc(),
      bytes: bytes,
    );
    _touch(key, _MemRow(entry: entry, touch: 0));
    _evictMemoryIfNeeded();
    await _writeDisk(key, entry);
  }

  Future<Uint8List?> peekBlob(String key) async {
    final entry = await peekBlobEntry(key);
    if (entry == null) return null;
    if (entry.bytes != null) return entry.bytes;
    try {
      return base64Decode(entry.body);
    } catch (_) {
      return null;
    }
  }

  /// Peek full entry (for MIME / freshness checks).
  Future<LibraryReadCacheEntry?> peekBlobEntry(String key) => _getEntry(key);

  /// Drop one blob from memory + disk (e.g. after vault re-import).
  Future<void> invalidateBlob(String key) async {
    _mem.remove(key);
    final dir = await _ensureDir();
    final id = _fileIdForKey(key);
    for (final suffix in ['.json', '.bin']) {
      final f = File(p.join(dir.path, '$id$suffix'));
      try {
        if (await f.exists()) await f.delete();
      } catch (_) {
        /* best-effort */
      }
    }
  }

  Future<Uint8List?> getOrFetchBlob(
    String key,
    Future<Uint8List?> Function() fetch, {
    String contentType = 'application/octet-stream',
    Duration? maxAge,
  }) async {
    final entry = await peekBlobEntry(key);
    if (entry != null) {
      final age = _clock().toUtc().difference(entry.cachedAt.toUtc());
      final fresh = maxAge == null || age < maxAge;
      if (fresh) {
        if (entry.bytes != null) return entry.bytes;
        try {
          return base64Decode(entry.body);
        } catch (_) {
          /* fall through to fetch */
        }
      }
    }
    final next = await fetch();
    if (next != null && next.isNotEmpty) {
      await putBlob(key, next, contentType: contentType);
    }
    return next;
  }

  /// Fetch with shared cache. Fresh hits skip the network for [freshTtl].
  Future<LibraryReadCachedResult> fetch(
    LibraryReadFn libraryRead, {
    required String targetOwnerId,
    required String path,
    bool revalidate = false,
  }) {
    final key = libraryReadCacheKey(targetOwnerId, path);
    final existing = _inflight[key];
    if (existing != null) return existing;
    final future = _fetch(
      libraryRead,
      targetOwnerId: targetOwnerId,
      path: path,
      revalidate: revalidate,
      key: key,
    );
    _inflight[key] = future;
    return future.whenComplete(() {
      if (identical(_inflight[key], future)) _inflight.remove(key);
    });
  }

  Future<LibraryReadCachedResult> _fetch(
    LibraryReadFn libraryRead, {
    required String targetOwnerId,
    required String path,
    required bool revalidate,
    required String key,
  }) async {
    final cached = await _getEntry(key);
    final now = _clock().toUtc();
    if (cached != null &&
        !revalidate &&
        now.difference(cached.cachedAt) < freshTtl) {
      Uint8List? bytes = cached.bytes;
      if (bytes == null && !cached.isText) {
        try {
          bytes = base64Decode(cached.body);
        } catch (_) {
          bytes = null;
        }
      }
      return LibraryReadCachedResult(
        status: 'ok',
        body: cached.body,
        contentType: cached.contentType,
        contentHash: cached.contentHash,
        etag: cached.etag,
        byteLength: cached.byteLength,
        isText: cached.isText,
        fromCache: true,
        bytes: bytes,
      );
    }

    final result = await fetchLibraryContent(
      libraryRead,
      targetOwnerId: targetOwnerId,
      path: path,
      cache: cached?.asFetchCache,
      revalidate: cached?.etag.isNotEmpty == true,
    );

    if (result.status == 'ok' && result.fromCache && cached != null) {
      final refreshed = LibraryReadCacheEntry(
        body: cached.body,
        contentType: cached.contentType,
        contentHash: cached.contentHash,
        etag: cached.etag,
        byteLength: cached.byteLength,
        isText: cached.isText,
        cachedAt: now,
        bytes: cached.bytes,
      );
      _touch(key, _MemRow(entry: refreshed, touch: 0));
      await _writeDisk(key, refreshed);
      return LibraryReadCachedResult(
        status: 'ok',
        body: cached.body,
        contentType: cached.contentType,
        contentHash: cached.contentHash,
        etag: cached.etag,
        byteLength: cached.byteLength,
        isText: cached.isText,
        fromCache: true,
        bytes: cached.bytes,
      );
    }

    if (result.status == 'ok') {
      await _putEntry(key, result);
      final entry = _mem[key]?.entry;
      return LibraryReadCachedResult(
        status: 'ok',
        body: result.body,
        contentType: result.contentType,
        contentHash: result.contentHash,
        etag: result.etag,
        byteLength: result.byteLength,
        isText: result.isText,
        fromCache: false,
        bytes: entry?.bytes,
      );
    }

    // Stale cache fallback when network fails.
    if (cached != null && result.status == 'error') {
      return LibraryReadCachedResult(
        status: 'ok',
        body: cached.body,
        contentType: cached.contentType,
        contentHash: cached.contentHash,
        etag: cached.etag,
        byteLength: cached.byteLength,
        isText: cached.isText,
        fromCache: true,
        bytes: cached.bytes,
      );
    }

    return LibraryReadCachedResult(
      status: result.status,
      body: result.body,
      contentType: result.contentType,
      contentHash: result.contentHash,
      etag: result.etag,
      byteLength: result.byteLength,
      isText: result.isText,
      error: result.error,
      fromCache: result.fromCache,
    );
  }

  Future<void> clear() async {
    _mem.clear();
    _touchSeq = 0;
    _inflight.clear();
    final dir = await _ensureDir();
    if (await dir.exists()) {
      await for (final ent in dir.list()) {
        try {
          await ent.delete(recursive: true);
        } catch (_) {
          /* best-effort */
        }
      }
    }
  }
}
