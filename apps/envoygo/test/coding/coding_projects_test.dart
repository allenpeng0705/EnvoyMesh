import 'package:envoygo/coding/coding_projects.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('normalizeCodingProjectPath collapses slash variants', () {
    expect(
      normalizeCodingProjectPath(r'C:\Users\me\app\'),
      'C:/Users/me/app',
    );
    expect(normalizeCodingProjectPath('/tmp/demo///'), '/tmp/demo');
  });

  test('addCodingProject dedupes slash and backslash variants', () async {
    await addCodingProject(r'/Users/me/app/');
    await addCodingProject(r'\Users\me\app');
    final loaded = await loadCodingProjects();
    expect(loaded, hasLength(1));
    expect(loaded.first.path, '/Users/me/app');
  });

  test('seedCodingProjectDefaultsIfEmpty fills harness once', () async {
    await addCodingProject('/tmp/seed');
    final seeded = await seedCodingProjectDefaultsIfEmpty(
      '/tmp/seed',
      harness: 'pi',
      model: 'gpt-4o',
      providerKind: 'openai-compatible',
    );
    expect(seeded?.defaultHarness, 'pi');
    expect(seeded?.defaultModel, 'gpt-4o');

    final again = await seedCodingProjectDefaultsIfEmpty(
      '/tmp/seed',
      harness: 'envoy-harness',
      model: 'other',
    );
    expect(again?.defaultHarness, 'pi');
    expect(again?.defaultModel, 'gpt-4o');
  });

  test('codingModelToEhHostModel prefixes compatible providers', () {
    expect(
      codingModelToEhHostModel('gpt-4o', 'openai-compatible'),
      'openai:gpt-4o',
    );
    expect(
      codingModelToEhHostModel('claude-sonnet', 'anthropic-compatible'),
      'anthropic:claude-sonnet',
    );
    expect(codingModelToEhHostModel('openai:gpt-4o', 'openai-compatible'), 'openai:gpt-4o');
    expect(codingModelToEhHostModel('', 'openai-compatible'), isNull);
  });

  test('addCodingProject registers path with default harness', () async {
    final project = await addCodingProject(
      '/Users/me/app',
      defaultHarness: 'pi',
    );
    expect(project.path, '/Users/me/app');
    expect(project.label, 'app');
    expect(project.defaultHarness, 'pi');

    final loaded = await loadCodingProjects();
    expect(loaded, hasLength(1));
    expect(loaded.first.defaultHarness, 'pi');
  });

  test('resolveCodingPrefill prefers registered project over stale last cwd',
      () async {
    await addCodingProject('/Users/me/aiNote');
    await saveCodingLastUsedPrefill(
      const CodingTaskPrefill(
        harness: 'pi',
        cwd: '/Users/me/EnvoyMesh',
      ),
    );
    final prefill = await resolveCodingPrefill();
    expect(prefill.cwd, '/Users/me/aiNote');
  });

  test('resolveCodingPrefill keeps last cwd when it is still registered',
      () async {
    await addCodingProject('/Users/me/EnvoyMesh');
    await addCodingProject('/Users/me/aiNote');
    await saveCodingLastUsedPrefill(
      const CodingTaskPrefill(
        harness: 'pi',
        cwd: '/Users/me/EnvoyMesh',
      ),
    );
    final prefill = await resolveCodingPrefill();
    expect(prefill.cwd, '/Users/me/EnvoyMesh');
  });

  test('removeCodingProject dismisses path from seeding', () async {
    await addCodingProject('/tmp/demo');
    await removeCodingProject('/tmp/demo/');
    expect(await loadCodingProjects(), isEmpty);

    await ensureCodingProjectsFromCwds(['/tmp/demo']);
    expect(await loadCodingProjects(), isEmpty);
  });
}
