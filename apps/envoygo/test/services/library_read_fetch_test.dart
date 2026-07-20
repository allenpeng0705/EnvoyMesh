import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:envoygo/models/library_read.dart';
import 'package:envoygo/services/content_hash.dart';
import 'package:envoygo/services/library_read_fetch.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('fetchLibraryContent', () {
    test('returns ok body for single-shot read', () async {
      final result = await fetchLibraryContent(
        ({
          required String targetOwnerId,
          required String path,
          Map<String, int>? range,
          String? ifNoneMatch,
          int? timeoutMs,
        }) async =>
            LibraryReadResult(
              peerOwnerId: targetOwnerId,
              libp2pPeerId: 'p',
              status: 'ok',
              body: '# Hi',
              contentType: 'text/markdown',
              byteLength: 4,
              latencyMs: 1,
            ),
        targetOwnerId: 'envoy:owner:a',
        path: 'hi.md',
      );
      expect(result.status, 'ok');
      expect(result.body, '# Hi');
      expect(result.isText, isTrue);
    });

    test('assembles too_large via range chunks', () async {
      final total = libraryReadChunkBytes + 10;
      final full = List.filled(total, 0x41); // 'A'
      final result = await fetchLibraryContent(
        ({
          required String targetOwnerId,
          required String path,
          Map<String, int>? range,
          String? ifNoneMatch,
          int? timeoutMs,
        }) async {
          if (range == null) {
            return LibraryReadResult(
              peerOwnerId: targetOwnerId,
              libp2pPeerId: 'p',
              status: 'too_large',
              contentType: 'text/plain',
              byteLength: total,
              latencyMs: 1,
            );
          }
          final start = range['start']!;
          final end = range['end']!;
          final slice = full.sublist(start, end + 1);
          return LibraryReadResult(
            peerOwnerId: targetOwnerId,
            libp2pPeerId: 'p',
            status: 'ok',
            body: base64Encode(slice),
            contentType: 'text/plain',
            byteLength: slice.length,
            latencyMs: 1,
          );
        },
        targetOwnerId: 'envoy:owner:a',
        path: 'big.txt',
      );
      expect(result.status, 'ok');
      expect(result.body, 'A' * total);
      expect(result.byteLength, total);
    });

    test('restores body from cache on not_modified', () async {
      const cache = BrowserFetchCacheEntry(
        body: '# Cached',
        contentType: 'text/markdown',
        contentHash: 'abc',
        etag: 'etag123',
        byteLength: 8,
        isText: true,
      );
      final result = await fetchLibraryContent(
        ({
          required String targetOwnerId,
          required String path,
          Map<String, int>? range,
          String? ifNoneMatch,
          int? timeoutMs,
        }) async {
          expect(ifNoneMatch, 'etag123');
          return LibraryReadResult(
            peerOwnerId: targetOwnerId,
            libp2pPeerId: 'p',
            status: 'not_modified',
            etag: 'etag123',
            contentHash: 'abc',
            contentType: 'text/markdown',
            byteLength: 8,
            latencyMs: 1,
          );
        },
        targetOwnerId: 'envoy:owner:a',
        path: 'hi.md',
        cache: cache,
        revalidate: true,
      );
      expect(result.status, 'ok');
      expect(result.fromCache, isTrue);
      expect(result.body, '# Cached');
    });

    test('errors when not_modified without cache', () async {
      final result = await fetchLibraryContent(
        ({
          required String targetOwnerId,
          required String path,
          Map<String, int>? range,
          String? ifNoneMatch,
          int? timeoutMs,
        }) async =>
            LibraryReadResult(
              peerOwnerId: targetOwnerId,
              libp2pPeerId: 'p',
              status: 'not_modified',
              etag: 'x',
              latencyMs: 1,
            ),
        targetOwnerId: 'envoy:owner:a',
        path: 'hi.md',
        revalidate: true,
      );
      expect(result.status, 'error');
      expect(result.error, contains('not_modified'));
    });

    test('propagates forbidden', () async {
      final result = await fetchLibraryContent(
        ({
          required String targetOwnerId,
          required String path,
          Map<String, int>? range,
          String? ifNoneMatch,
          int? timeoutMs,
        }) async =>
            LibraryReadResult(
              peerOwnerId: targetOwnerId,
              libp2pPeerId: 'p',
              status: 'forbidden',
              latencyMs: 1,
            ),
        targetOwnerId: 'envoy:owner:a',
        path: 'secret.md',
      );
      expect(result.status, 'forbidden');
    });

    test('errors when range chunk fails', () async {
      final result = await fetchLibraryContent(
        ({
          required String targetOwnerId,
          required String path,
          Map<String, int>? range,
          String? ifNoneMatch,
          int? timeoutMs,
        }) async {
          if (range == null) {
            return LibraryReadResult(
              peerOwnerId: targetOwnerId,
              libp2pPeerId: 'p',
              status: 'too_large',
              contentType: 'text/plain',
              byteLength: libraryReadChunkBytes + 5,
              latencyMs: 1,
            );
          }
          return LibraryReadResult(
            peerOwnerId: targetOwnerId,
            libp2pPeerId: 'p',
            status: 'not_found',
            latencyMs: 1,
          );
        },
        targetOwnerId: 'envoy:owner:a',
        path: 'big.txt',
      );
      expect(result.status, 'error');
      expect(result.error, contains('range fetch failed'));
    });
  });

  group('verifyContentHash', () {
    test('accepts matching utf8 hash', () {
      const body = '# Hello';
      final hash = sha256.convert(utf8.encode(body)).toString();
      expect(
        verifyContentHash(
          body: body,
          contentType: 'text/markdown',
          expectedHash: hash,
        ),
        isTrue,
      );
    });

    test('rejects mismatch', () {
      expect(
        verifyContentHash(
          body: '# Hello',
          contentType: 'text/markdown',
          expectedHash: '0' * 64,
        ),
        isFalse,
      );
    });

    test('skips when expectedHash absent', () {
      expect(
        verifyContentHash(
          body: 'x',
          contentType: 'text/plain',
          expectedHash: null,
        ),
        isTrue,
      );
    });
  });
}
