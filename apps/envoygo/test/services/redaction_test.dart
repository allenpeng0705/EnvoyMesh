import 'package:envoy_thin_client/services/redaction.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('redactSecretQueryValues', () {
    test('redacts token= values in a URL', () {
      expect(
        redactSecretQueryValues('wss://relay.example.com/ws?token=supersecret&x=1'),
        'wss://relay.example.com/ws?token=<redacted>&x=1',
      );
    });

    test('redacts sessionToken / pairing / key-style params case-insensitively',
        () {
      expect(
        redactSecretQueryValues(
            'ws://10.0.0.5:3030/ws?sessionToken=abc123&relay=1'),
        'ws://10.0.0.5:3030/ws?sessionToken=<redacted>&relay=1',
      );
      expect(
        redactSecretQueryValues('ws://h:1/ws?PAIRING=xx.yy'),
        'ws://h:1/ws?PAIRING=<redacted>',
      );
      expect(
        redactSecretQueryValues('ws://h:1/ws?apiKey=k&other=1'),
        'ws://h:1/ws?apiKey=<redacted>&other=1',
      );
    });

    test('redacts the first of several secret params', () {
      expect(
        redactSecretQueryValues('ws://h:1/ws?token=a&token=b'),
        'ws://h:1/ws?token=<redacted>&token=<redacted>',
      );
    });

    test('leaves text without secret params unchanged', () {
      const clean = 'homeRemote.connectFailed — tried: [lan=ws://10.0.0.1:3030/ws]';
      expect(redactSecretQueryValues(clean), clean);
    });

    test('never throws on garbage input', () {
      expect(redactSecretQueryValues(''), '');
      expect(redactSecretQueryValues('token'), 'token');
      expect(redactSecretQueryValues('=value'), '=value');
      expect(redactSecretQueryValues('?x=='), '?x==');
    });
  });

  group('redactedCandidateLabel', () {
    test('keeps the name and redacts the URL', () {
      expect(
        redactedCandidateLabel('relay', 'wss://relay.example.com/ws?token=sekrit'),
        'relay=wss://relay.example.com/ws?token=<redacted>',
      );
    });
  });
}
