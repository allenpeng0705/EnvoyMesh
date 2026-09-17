import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_state.dart';
import 'package:dart_libp2p/p2p/security/noise/handshake_state.dart';

void main() {
  group('NoiseStateMachine', () {
    late NoiseStateMachine initiator;
    late NoiseStateMachine responder;

    setUp(() {
      initiator = NoiseStateMachine(true);
      responder = NoiseStateMachine(false);
    });

    test('initial state is correct', () {
      expect(initiator.state, equals(XXHandshakeState.initial));
      expect(responder.state, equals(XXHandshakeState.initial));
    });

    group('validateRead', () {
      test('initiator cannot read in initial state', () {
        expect(
          () => initiator.validateRead(),
          throwsA(isA<StateError>().having(
            (e) => e.message,
            'message',
            'Initiator cannot receive first message'
          ))
        );
      });

      test('responder can read in initial state', () {
        responder.validateRead();  // Should not throw
      });

      test('initiator can read in sentE state', () {
        initiator.transitionAfterWrite();  // Move to sentE
        initiator.validateRead();  // Should not throw
      });

      test('responder cannot read in sentE state', () {
        responder.transitionAfterRead();  // Move to sentE
        expect(
          () => responder.validateRead(),
          throwsA(isA<StateError>().having(
            (e) => e.message,
            'message',
            'Responder cannot receive second message'
          ))
        );
      });

      test('cannot read in completed state', () {
        initiator
          ..transitionAfterWrite()  // sentE
          ..transitionAfterRead()   // sentEES
          ..transitionAfterWrite(); // complete

        expect(
          () => initiator.validateRead(),
          throwsA(isA<StateError>().having(
            (e) => e.message,
            'message',
            'Cannot read message in completed state'
          ))
        );
      });
    });

    group('validateWrite', () {
      test('initiator can write in initial state', () {
        initiator.validateWrite();  // Should not throw
      });

      test('responder cannot write in initial state', () {
        expect(
          () => responder.validateWrite(),
          throwsA(isA<StateError>().having(
            (e) => e.message,
            'message',
            'Responder cannot send first message'
          ))
        );
      });

      test('initiator cannot write in sentE state', () {
        initiator.transitionAfterWrite();  // Move to sentE
        expect(
          () => initiator.validateWrite(),
          throwsA(isA<StateError>().having(
            (e) => e.message,
            'message',
            'Initiator cannot send second message'
          ))
        );
      });

      test('responder can write in sentE state', () {
        responder.transitionAfterRead();  // Move to sentE
        responder.validateWrite();  // Should not throw
      });

      test('cannot write in completed state', () {
        responder
          ..transitionAfterRead()   // sentE
          ..transitionAfterWrite()  // sentEES
          ..transitionAfterRead();  // complete

        expect(
          () => responder.validateWrite(),
          throwsA(isA<StateError>().having(
            (e) => e.message,
            'message',
            'Cannot write message in completed state'
          ))
        );
      });
    });

    group('state transitions', () {
      test('initiator follows correct transition path', () {
        expect(initiator.state, equals(XXHandshakeState.initial));
        
        initiator.transitionAfterWrite();  // -> e
        expect(initiator.state, equals(XXHandshakeState.sentE));
        
        initiator.transitionAfterRead();   // <- e, ee, s, es
        expect(initiator.state, equals(XXHandshakeState.sentEES));
        
        initiator.transitionAfterWrite();  // -> s, se
        expect(initiator.state, equals(XXHandshakeState.complete));
      });

      test('responder follows correct transition path', () {
        expect(responder.state, equals(XXHandshakeState.initial));
        
        responder.transitionAfterRead();   // <- e
        expect(responder.state, equals(XXHandshakeState.sentE));
        
        responder.transitionAfterWrite();  // -> e, ee, s, es
        expect(responder.state, equals(XXHandshakeState.sentEES));
        
        responder.transitionAfterRead();   // <- s, se
        expect(responder.state, equals(XXHandshakeState.complete));
      });

      test('error state transition is permanent', () {
        initiator.transitionToError();
        expect(initiator.state, equals(XXHandshakeState.error));
        
        expect(
          () => initiator.transitionAfterWrite(),
          throwsA(isA<StateError>())
        );
        expect(
          () => initiator.transitionAfterRead(),
          throwsA(isA<StateError>())
        );
        expect(initiator.state, equals(XXHandshakeState.error));
      });
    });

    test('isComplete property', () {
      expect(initiator.isComplete, isFalse);
      
      initiator
        ..transitionAfterWrite()
        ..transitionAfterRead()
        ..transitionAfterWrite();
      
      expect(initiator.isComplete, isTrue);
    });

    group('state transition order', () {
      test('initiator follows correct state order', () {
        final initiator = NoiseStateMachine(true);
        final states = <XXHandshakeState>[];
        
        // Record initial state
        states.add(initiator.state);
        
        // -> e
        initiator.validateWrite();
        initiator.transitionAfterWrite();
        states.add(initiator.state);
        
        // <- e, ee, s, es
        initiator.validateRead();
        initiator.transitionAfterRead();
        states.add(initiator.state);
        
        // -> s, se
        initiator.validateWrite();
        initiator.transitionAfterWrite();
        states.add(initiator.state);
        
        // Verify state order
        expect(states, equals([
          XXHandshakeState.initial,   // Start state
          XXHandshakeState.sentE,     // After sending e
          XXHandshakeState.sentEES,   // After receiving e, ee, s, es
          XXHandshakeState.complete,  // After sending s, se
        ]));
      });
      
      test('responder follows correct state order', () {
        final responder = NoiseStateMachine(false);
        final states = <XXHandshakeState>[];
        
        // Record initial state
        states.add(responder.state);
        
        // <- e
        responder.validateRead();
        responder.transitionAfterRead();
        states.add(responder.state);
        
        // -> e, ee, s, es
        responder.validateWrite();
        responder.transitionAfterWrite();
        states.add(responder.state);
        
        // <- s, se
        responder.validateRead();
        responder.transitionAfterRead();
        states.add(responder.state);
        
        // Verify state order
        expect(states, equals([
          XXHandshakeState.initial,   // Start state
          XXHandshakeState.sentE,     // After receiving e
          XXHandshakeState.sentEES,   // After sending e, ee, s, es
          XXHandshakeState.complete,  // After receiving s, se
        ]));
      });
      
      test('error state can occur at any point', () {
        final machine = NoiseStateMachine(true);
        final states = <XXHandshakeState>[];
        
        // Record initial state
        states.add(machine.state);
        
        // Transition to error from initial
        machine.transitionToError();
        states.add(machine.state);
        
        // Create new machine and go to sentE before error
        final machine2 = NoiseStateMachine(true);
        machine2.transitionAfterWrite();  // -> sentE
        machine2.transitionToError();
        states.add(machine2.state);
        
        // Create new machine and go to sentEES before error
        final machine3 = NoiseStateMachine(true);
        machine3.transitionAfterWrite();  // -> sentE
        machine3.transitionAfterRead();   // -> sentEES
        machine3.transitionToError();
        states.add(machine3.state);
        
        // Verify error states
        expect(states, equals([
          XXHandshakeState.initial,  // Start state
          XXHandshakeState.error,    // Error from initial
          XXHandshakeState.error,    // Error from sentE
          XXHandshakeState.error,    // Error from sentEES
        ]));
        
        // Verify no further transitions are possible
        expect(
          () => machine.transitionAfterWrite(),
          throwsA(isA<StateError>()),
        );
        expect(
          () => machine.transitionAfterRead(),
          throwsA(isA<StateError>()),
        );
      });
    });

    test('validates correct message sequence for initiator', () {
      final machine = NoiseStateMachine(true); // true for initiator
      
      // First action should be write
      expect(() => machine.validateWrite(), returnsNormally);
      
      // Second action should be read
      expect(() => machine.validateRead(), throwsStateError);
    });

    test('rejects incorrect message sequence for initiator', () {
      final machine = NoiseStateMachine(true); // true for initiator
      
      // Attempting to read first should throw
      expect(() => machine.validateRead(), throwsStateError);
    });
  });
} 