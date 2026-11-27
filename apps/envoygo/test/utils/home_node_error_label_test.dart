import 'package:envoygo/l10n/app_localizations_en.dart';
import 'package:envoygo/utils/localized_labels.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final l10n = AppLocalizationsEn();

  test('homeNodeErrorLabel maps typed codes to end-user copy', () {
    expect(
      homeNodeErrorLabel(l10n, 'unauthorized'),
      contains('Session expired'),
    );
    expect(
      homeNodeErrorLabel(l10n, 'transport'),
      contains("Can't reach"),
    );
    expect(
      homeNodeErrorLabel(l10n, 'no_candidates'),
      contains('No way to reach'),
    );
    expect(homeNodeErrorLabel(l10n, 'offline'), contains('offline'));
    expect(
      homeNodeErrorLabel(l10n, 'something-else'),
      contains("Couldn't connect"),
    );
    expect(
      homeNodeErrorLabel(l10n, null),
      contains("Couldn't connect"),
    );
  });
}
