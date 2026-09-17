import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/security/noise/handshake_state.dart';

void main() {
  group('XXHandshakeState', () {
    test('has correct number of states', () {
      expect(XXHandshakeState.values.length, equals(5));
    });

    test('has correct state values', () {
      expect(XXHandshakeState.values, containsAll([
        XXHandshakeState.initial,
        XXHandshakeState.sentE,
        XXHandshakeState.sentEES,
        XXHandshakeState.complete,
        XXHandshakeState.error,
      ]));
    });

    test('states are in correct order', () {
      final states = XXHandshakeState.values;
      expect(states[0], equals(XXHandshakeState.initial));
      expect(states[1], equals(XXHandshakeState.sentE));
      expect(states[2], equals(XXHandshakeState.sentEES));
      expect(states[3], equals(XXHandshakeState.complete));
      expect(states[4], equals(XXHandshakeState.error));
    });

    test('toString returns correct string representation', () {
      expect(XXHandshakeState.initial.toString(), contains('initial'));
      expect(XXHandshakeState.sentE.toString(), contains('sentE'));
      expect(XXHandshakeState.sentEES.toString(), contains('sentEES'));
      expect(XXHandshakeState.complete.toString(), contains('complete'));
      expect(XXHandshakeState.error.toString(), contains('error'));
    });
  });
} 