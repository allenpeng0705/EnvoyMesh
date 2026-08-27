// Pins block-mode speculation UI: attempt list, pick, reassign, and auto override.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

const _screenPath = 'lib/screens/chains/active_chain_detail_screen.dart';
const _modelPath = 'lib/models/chain_active.dart';
const _clientPath = 'lib/services/node_service_client.dart';
const _l10nPath = 'lib/utils/chain_localization.dart';

String _readSrc(String path) => File(path).readAsStringSync();

void main() {
  group('EnvoyGo active chain detail — speculation review (Phase 63)', () {
    test('renders attempt pick and reassign actions for block mode', () {
      final src = _readSrc(_screenPath);
      expect(src, contains('st.speculationReview.isNotEmpty'));
      expect(src, contains('chainsSpeculationReviewPick'));
      expect(src, contains('chainsSpeculationReviewReassign'));
      expect(src, contains('_resolveSpeculationPick'));
      expect(src, contains('_resolveSpeculationReassign'));
      expect(src, contains('_resolveSpeculationAuto'));
    });

    test('uses localized step state labels', () {
      final src = _readSrc(_screenPath);
      expect(src, contains('chainStepStateLabel(l10n, step.state)'));
      expect(_readSrc(_l10nPath), contains('chainStepStateLabel'));
    });

    test('ChainSpeculationReview model parses attempts', () {
      final src = _readSrc(_modelPath);
      expect(src, contains('class ChainSpeculationAttempt'));
      expect(src, contains('final List<ChainSpeculationReview> speculationReview'));
    });

    test('NodeServiceClient exposes chainResolveSpeculation and chainSetDefaults', () {
      final src = _readSrc(_clientPath);
      expect(src, contains('Future<Map<String, dynamic>> chainResolveSpeculation'));
      expect(src, contains('attemptId'));
      expect(src, contains('chainSetDefaults'));
    });
  });
}
