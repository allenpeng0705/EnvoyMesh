import 'package:envoygo/eh/eh_review_prefs.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('getEhReviewMinFiles defaults to 1', () async {
    expect(await getEhReviewMinFiles(), 1);
  });

  test('setEhReviewMinFiles persists and clamps negatives', () async {
    await setEhReviewMinFiles(5);
    expect(await getEhReviewMinFiles(), 5);
    await setEhReviewMinFiles(-3);
    expect(await getEhReviewMinFiles(), 0);
  });
}
