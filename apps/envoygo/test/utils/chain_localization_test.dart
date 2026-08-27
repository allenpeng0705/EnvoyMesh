import 'package:envoygo/l10n/app_localizations_en.dart';
import 'package:envoygo/utils/chain_localization.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final l10n = AppLocalizationsEn();

  test('chainStepStateLabel localizes known states', () {
    expect(chainStepStateLabel(l10n, 'running'), l10n.chainsStepStateRunning);
    expect(chainStepStateLabel(l10n, 'unknown_state'), 'unknown_state');
  });

  test('chainRpcErrorLabel maps no_workers', () {
    expect(chainRpcErrorLabel(l10n, 'no_workers'), l10n.chainsStartNoWorkers);
  });

  test('chainCaughtErrorLabel strips Exception prefix', () {
    expect(
      chainCaughtErrorLabel(l10n, Exception('no_workers')),
      l10n.chainsStartNoWorkers,
    );
  });
}
