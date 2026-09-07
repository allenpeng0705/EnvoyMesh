import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:test/test.dart';

void main() {
  group('cidStringForCapabilityTopic (TS parity)', () {
    test('matches desktop golden CIDs', () {
      expect(
        cidStringForCapabilityTopic('music'),
        'bafkreifjrzahfi2uja5mu4qctc3n3vtcglijbhxn665ua3j3pjszxx6dpm',
      );
      expect(
        cidStringForCapabilityTopic('interest:music'),
        'bafkreih3bqendfadvplwkdalogbhjutxmenxeqzx7jbeyqfs7zdl2cm2ge',
      );
      expect(
        cidStringForCapabilityTopic('displayname:allen-peng'),
        'bafkreigc5mz326lguqkh3r5ldwuimcp5yjxytexeh44r5rqt7kovp3jvk4',
      );
      expect(
        cidStringForCapabilityTopic('task.execute'),
        'bafkreigqx3rq6skom5ymti66s44zaa4rbnncrwxqd7bxmltsj5e4kkc3qa',
      );
    });

    test('rejects empty topic', () {
      expect(() => cidStringForCapabilityTopic(''), throwsArgumentError);
      expect(() => cidStringForCapabilityTopic('   '), throwsArgumentError);
    });
  });

  group('discovery topics', () {
    test('interestTopicFor and displayNameTopicFor are idempotent', () {
      expect(interestTopicFor('Music'), 'interest:music');
      expect(interestTopicFor('interest:music'), 'interest:music');
      expect(displayNameTopicFor('Allen Peng'), 'displayname:allen-peng');
      expect(
        displayNameTopicFor('displayname:allen-peng'),
        'displayname:allen-peng',
      );
    });

    test('computePhoneDiscoveryTopics from profile', () {
      final topics = computePhoneDiscoveryTopics({
        'displayName': 'Allen Peng',
        'hobbies': ['Music'],
        'knowledge': ['Rust'],
      });
      expect(topics, contains('displayname:allen-peng'));
      expect(topics, contains('interest:music'));
      expect(topics, contains('interest:rust'));
    });

    test('expandDiscoveryTopicQueries', () {
      final q = expandDiscoveryTopicQueries(topic: 'music');
      expect(q, contains('interest:music'));
      expect(q, contains('displayname:music'));
      expect(q, contains('music'));
    });
  });
}
