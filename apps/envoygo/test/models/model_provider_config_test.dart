import 'package:envoygo/models/model_provider_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('fromJson and toJson round-trip', () {
    const cfg = ModelProviderConfig(
      mode: 'openai-compatible',
      endpoint: 'https://api.openai.com/v1',
      modelName: 'gpt-4o-mini',
      apiKey: 'sk-test',
    );
    final json = cfg.toJson();
    expect(json['mode'], 'openai-compatible');
    final back = ModelProviderConfig.fromJson(json);
    expect(back.mode, cfg.mode);
    expect(back.endpoint, cfg.endpoint);
    expect(back.modelName, cfg.modelName);
    expect(back.apiKey, cfg.apiKey);
  });

  test('fromJson defaults mode to mock', () {
    expect(ModelProviderConfig.fromJson(null).mode, 'mock');
  });
}
