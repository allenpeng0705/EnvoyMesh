import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:envoy_thin_client/envoy_thin_client.dart';
import 'package:test/test.dart';

/// Build the compact code exactly as the node does: gzip a payload, base64url it, and
/// put it in `envoy://pair?pairing=…`. This is the form a QR actually carries, so the
/// test has to exercise *this* path rather than the legacy query one.
String compactPairingUri(Map<String, Object?> payload) {
  final compressed = GZipEncoder().encode(utf8.encode(jsonEncode(payload)))!;
  final token = base64Url.encode(compressed).replaceAll('=', '');
  return 'envoy://pair?pairing=$token';
}

/// Which app a pairing code belongs to — the Dart half of "one app per pairing code".
///
/// This is the *only* enforcement point for that rule: the pairing token inside the code
/// is opaque and app-local, so another product's node never validates it, and the node
/// this phone talks to sees only its own token. Without the check below, the outcome of
/// scanning the wrong QR code is that the app dutifully dials the `wsUrl` inside it.
void main() {
  group('parsePairingUri reads the app claim', () {
    test('from the legacy query form', () {
      final data = parsePairingUri(
        'envoy://pair?wsUrl=${Uri.encodeComponent("ws://127.0.0.1:3030/ws")}'
        '&token=t&app=EnvoyDev',
      );
      expect(data, isNotNull);
      expect(data!.app, 'EnvoyDev');
    });

    test('from the compact code a QR actually carries', () {
      final uri = compactPairingUri({
        'v': 1,
        'ws': 'ws://127.0.0.1:3030/ws',
        'tok': 't',
        'oid': 'envoy:owner:alice',
        'app': 'EnvoyDev',
      });
      final data = parsePairingUri(uri);
      expect(data, isNotNull);
      expect(data!.app, 'EnvoyDev');
    });

    test('and leaves it null when the code predates the field', () {
      final data = parsePairingUri(
        'envoy://pair?wsUrl=${Uri.encodeComponent("ws://127.0.0.1:3030/ws")}&token=t',
      );
      expect(data, isNotNull);
      expect(data!.app, isNull);
    });
  });

  group('pairingAppMismatch', () {
    test('accepts its own app, and a code that names none', () {
      expect(pairingAppMismatch('EnvoyDev', 'EnvoyDev'), isNull);
      // Codes minted before the field existed must keep working: refusing them would
      // break every QR already printed, and the phone still has to authenticate.
      expect(pairingAppMismatch(null, 'EnvoyDev'), isNull);
      expect(pairingAppMismatch('   ', 'EnvoyDev'), isNull);
    });

    test('refuses another app, in words the user can act on', () {
      final message = pairingAppMismatch('EnvoyMesh', 'EnvoyDev');
      expect(message, isNotNull);
      expect(message, contains('EnvoyMesh'));
      expect(message, contains('EnvoyDev'));
      expect(message, anyOf(contains('show its pairing code'), contains('install')));
      // The user is the audience: no wire vocabulary.
      expect(message, isNot(contains('token')));
      expect(message, isNot(contains('scope')));
    });

    test('does not let a scanned code put arbitrary text in the dialog', () {
      final message = pairingAppMismatch('${'x' * 200}\u001b[31mEVIL', 'EnvoyDev');
      expect(message, isNotNull);
      expect(message, isNot(contains('\u001b')));
      // The label is capped (the sentence around it is fixed prose).
      expect(RegExp(r'x{41,}').hasMatch(message!), isFalse);
      expect(message, contains('\u2026'));
    });
  });

  // ─── Relay roster round trips ──────────────────────────────────────────────
  //
  // Defect 1 lived here: the desktop pair-URI builder writes the roster as the plural
  // `relayWsUrls`, but this parser read only the singular `relayWsUrl` and the invite
  // spelling `rels`, so a relay list minted by the desktop QR never reached the phone.
  // The fixtures below are literal output of EnvoyMesh's TypeScript builder, so a change
  // that makes one side stop understanding the other fails here instead of in the field.
  group('relay roster', () {
    test('legacy pair URI: a multi-entry relayWsUrls list survives to the phone', () {
      // `buildEnvoyPairUri({ wsUrl, token, ownerPublicKey, ownerId, app, relayWsUrls })`.
      const uri =
          'envoy://pair?wsUrl=wss%3A%2F%2Frelay.example%3A15432%2Fws%3Ftarget%3D12D3KooWHome%26token%3Dtok&token=tok&ownerPublicKey=pk&ownerId=envoy%3Aowner%3Aalice&app=EnvoyGo&relayWsUrls=wss%3A%2F%2Frelay-us.example%3A15432%2Fws%2Cwss%3A%2F%2Frelay-eu.example%3A15432%2Fws';
      final data = parsePairingUri(uri);
      expect(data, isNotNull);
      expect(data!.relayWsUrls, [
        'wss://relay-us.example:15432/ws',
        'wss://relay-eu.example:15432/ws',
      ]);
      // The singular primary stays the primary — it is not folded into the list.
      expect(data.relayWsUrl,
          'wss://relay.example:15432/ws?target=12D3KooWHome&token=tok');
    });

    test('invite spelling rels still reads, and both names union when present', () {
      // `envoy://invite` is minted with `rels` by `envoy-invite-uri.ts`; both URIs reach
      // this one parser, so accepting only the pair spelling would swap one broken
      // producer for another.
      final invite = parsePairingUri(
        'envoy://invite?token=t&wsUrl=wss%3A%2F%2Fprimary.example%2Fws'
        '&relayWsUrl=wss%3A%2F%2Fprimary.example%2Fws'
        '&rels=wss%3A%2F%2Feu.example%2Fws',
      );
      expect(invite, isNotNull);
      expect(invite!.relayWsUrls, ['wss://eu.example/ws']);

      final both = parsePairingUri(
        'envoy://pair?token=t&wsUrl=wss%3A%2F%2Fprimary.example%2Fws'
        '&relayWsUrls=wss%3A%2F%2Fa.example%2Fws%2Cwss%3A%2F%2Fb.example%2Fws'
        '&rels=wss%3A%2F%2Fb.example%2Fws%2Cwss%3A%2F%2Fc.example%2Fws',
      );
      expect(both, isNotNull);
      expect(both!.relayWsUrls, [
        'wss://a.example/ws',
        'wss://b.example/ws',
        'wss://c.example/ws',
      ]);
    });

    test('compressed form: a TS-minted pairing= token decodes with its roster', () {
      // Defect 2: the compressed form is read here but the TS encoder never minted it.
      // This is the literal URI `buildEnvoyPairUriCompressed(...)` produced for a payload
      // with a home-node peer id, three dialable multiaddrs, three relays and an owner
      // key. Regenerate it by re-running that builder — the token is gzip of the V1 JSON
      // in `pairing-token.ts`, and the TS side asserts the same payload field for field
      // (`packages/api/test/envoy-pair-uri.test.ts`). If either side renames a key, this
      // test fails instead of the field.
      const uri =
          'envoy://pair?pairing=H4sIAAAAAAAAE4VSa0vDMBT9K-N-8FOXNGl9BYbsUabODRV0FJWRdkGqXRKbdF0V_7ukDtxDMR8Cuffce-65Jx-wBEY8qAwwqIxhGBci5zUSK77QuWDkMAworsyZ5cWzsB1CB8FIqem5WogDq16F7GirXsEDdzNYP1Q2BwZCLlXNVCVFwXiepQI8KERugD1skrVLs8cH3hZClP8huN5HPHmQc9koYxiTU4rI0QkiiPos8AP_u4ltRt3UBR5w_SNgxp-FtDOepC4h-UIAA4drjbkLJdrpwZkOtyiwTTUOfZ9gTTXe6d-gqR8gHxESIOLjcr5Gv5VZ2l7-XRUeo9MAEYIoob9zXE1uw2k8Pe-ZSpyUq8P3qamP0nJYVzK-vkzmCe8miV5cjl8S5QrbaVakZWb3KZ_cJjQwiNwihso5q53NbXd60fBi0rq-611d9FujKG6Cj3LcV1XvJh6M6H3VraOuFcaOovhRNvloMtgtcb9Cb7lw6yyFzy_YsCGfngIAAA';
      final data = parsePairingUri(uri);
      expect(data, isNotNull);
      expect(data!.wsUrl,
          'wss://relay.example:15432/ws?target=12D3KooWHome&token=ptok');
      // `rel` is absent, so the primary relay is `ws` — same fallback the legacy reader uses.
      expect(data.relayWsUrl, data.wsUrl);
      expect(data.relayWsUrls, [
        'wss://relay-us.example:15432/ws',
        'wss://relay-eu.example:15432/ws',
        'wss://relay-ap.example:15432/ws',
      ]);
      expect(data.lanWsUrl, 'ws://192.168.1.20:3030/ws');
      expect(data.homeNodePeerId, '12D3KooWHome');
      expect(data.agentPeerId, 'envoy_agent_abc');
      expect(data.agentName, 'Home Mac');
      expect(data.app, 'EnvoyGo');
      expect(data.token, 'ptok');
      // Multi-entry, and the *dialable address* list — not a second copy of the relay
      // list. The old decoder aliased `bootstrapPeers` to `relayWsUrls`, so a single
      // entry (or two identical lists) would not have caught the bug.
      expect(data.bootstrapPeers, [
        '/ip4/192.168.1.20/tcp/4001/p2p/12D3KooWHome',
        '/ip4/203.0.113.10/udp/4001/quic-v1/p2p/12D3KooWHome',
        '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo/p2p-circuit/p2p/12D3KooWHome',
      ]);
      expect(data.bootstrapPeers, isNot(data.relayWsUrls));
      // Owner identity + relay peer id travel in the compressed form too; without these
      // the compressed code would be a lossy substitute for the query form.
      expect(
        data.ownerPublicKey,
        '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtestKEY\n-----END PUBLIC KEY-----',
      );
      expect(data.relayPeerId, '12D3KooWRelay');
    });

    test('an older v1 token without `bp` still decodes, with no invented addresses', () {
      // A token minted before `bp` existed carries no multiaddrs. The reader must leave
      // `bootstrapPeers` null rather than filling it with `relayWsUrls` — that alias was
      // the bug this fixes, and the relay list is still read on its own.
      const uri =
          'envoy://pair?pairing=H4sIAAAAAAAAE4WQUUvDMBCA_8q4B5-ytmlV9GDIuoY56oYKKsXJiPMYY20Smmy1iP9dUgU392AeArn7cnfffcAOkDNoLCA01mIY1lTKNqB3WZmSkJ-dJnHY2Csn6xW5AY-zJNf66VpXdOL0htTAOL0BBv5G-Hno9RsgkNrpFnWjqEZZrpcEDGoqLeDzfrP-1h71A3ZA0PY_Qppj4oVBKVVnhmHIL-OAn18EPIgjTKIk-i7iulH3vYCBNL8CC7ki5RbydekTSlYECJ7rTWUXMgYQhEfH2rsbv4i-P6kYT2a924f0ZjLq5aLognM1HekmvSuyPH5shq0YOrIuF8VcdXkxy_5-8XszB3Pee2n4_AII2KmdwAEAAA';
      final data = parsePairingUri(uri);
      expect(data, isNotNull);
      expect(data!.homeNodePeerId, '12D3KooWHome');
      expect(data.bootstrapPeers, isNull);
      expect(data.relayWsUrls, isNotEmpty);
    });
  });

  // ─── Dial addresses round trips ────────────────────────────────────────────
  //
  // `homeNodePeerId` says *who* the home peer is; `bootstrapPeers` says *where* to dial
  // it. The TypeScript builder already wrote the peer id on both forms, but wrote the
  // address list on neither, and this decoder aliased `bootstrapPeers` to `relayWsUrls` —
  // so a phone that trusted the field was handed relay WebSocket URLs where libp2p
  // multiaddrs belong, and a relay-free dial was impossible. The fixtures are literal
  // TypeScript output so the two sides cannot drift silently.
  group('dial addresses', () {
    test('legacy pair URI: a multi-entry bootstrapPeers list survives', () {
      // Literal output of
      // `buildEnvoyPairUri({ wsUrl, token, ownerPublicKey, ownerId, relayPeerId,
      //   relayWsUrls, homeNodePeerId, bootstrapPeers, lanWsUrl })`.
      // Regenerate by re-running that builder; a single-entry list would be exactly the
      // weak fixture that let the relay bug hide, so this asserts three.
      const uri =
          'envoy://pair?wsUrl=wss%3A%2F%2Frelay.example%3A15432%2Fws%3Ftarget%3D12D3KooWHome%26token%3Dptok&lanWsUrl=ws%3A%2F%2F192.168.1.20%3A3030%2Fws&token=ptok&ownerPublicKey=-----BEGIN+PUBLIC+KEY-----%0AMCowBQYDK2VwAyEAtestKEY%0A-----END+PUBLIC+KEY-----&ownerId=envoy%3Aowner%3Aalice&relayPeerId=12D3KooWRelay&homeNodePeerId=12D3KooWHome&relayWsUrls=wss%3A%2F%2Frelay-us.example%3A15432%2Fws%2Cwss%3A%2F%2Frelay-eu.example%3A15432%2Fws%2Cwss%3A%2F%2Frelay-ap.example%3A15432%2Fws&bootstrapPeers=%2Fip4%2F192.168.1.20%2Ftcp%2F4001%2Fp2p%2F12D3KooWHome%2C%2Fip4%2F203.0.113.10%2Fudp%2F4001%2Fquic-v1%2Fp2p%2F12D3KooWHome%2C%2Fip4%2F47.93.11.212%2Ftcp%2F4001%2Fp2p%2F12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo%2Fp2p-circuit%2Fp2p%2F12D3KooWHome';
      final data = parsePairingUri(uri);
      expect(data, isNotNull);
      expect(data!.homeNodePeerId, '12D3KooWHome');
      expect(data.bootstrapPeers, [
        '/ip4/192.168.1.20/tcp/4001/p2p/12D3KooWHome',
        '/ip4/203.0.113.10/udp/4001/quic-v1/p2p/12D3KooWHome',
        '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo/p2p-circuit/p2p/12D3KooWHome',
      ]);
      // The relay hints are a separate list on the same URI; reading one must not consume
      // the other.
      expect(data.relayWsUrls, [
        'wss://relay-us.example:15432/ws',
        'wss://relay-eu.example:15432/ws',
        'wss://relay-ap.example:15432/ws',
      ]);
    });

    test('legacy pair URI: duplicates collapse and blanks are dropped', () {
      final data = parsePairingUri(
        'envoy://pair?wsUrl=ws%3A%2F%2Fh%3A1%2Fws&token=t'
        '&bootstrapPeers=%2Fip4%2F10.0.0.1%2Ftcp%2F4001%2C%20%2C%2Fip4%2F10.0.0.1%2Ftcp%2F4001%2C%2Fip4%2F10.0.0.2%2Ftcp%2F4001',
      );
      expect(data, isNotNull);
      expect(data!.bootstrapPeers, [
        '/ip4/10.0.0.1/tcp/4001',
        '/ip4/10.0.0.2/tcp/4001',
      ]);
    });
  });

  test('the default app name matches the node side', () {
    // `@envoymesh/protocol`'s DEFAULT_APP_NAME — the two must agree or every code
    // minted on one side looks foreign to the other.
    expect(kDefaultAppName, 'EnvoyMesh');
  });
}
