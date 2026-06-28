/// Home node LLM provider settings (`NodeConfig.modelProviders`).
class ModelProviderConfig {
  final String mode;
  final String? endpoint;
  final String? modelName;
  final String? apiKey;

  const ModelProviderConfig({
    required this.mode,
    this.endpoint,
    this.modelName,
    this.apiKey,
  });

  factory ModelProviderConfig.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const ModelProviderConfig(mode: 'mock');
    }
    return ModelProviderConfig(
      mode: json['mode'] as String? ?? 'mock',
      endpoint: json['endpoint'] as String?,
      modelName: json['modelName'] as String?,
      apiKey: json['apiKey'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'mode': mode,
        if (endpoint != null && endpoint!.isNotEmpty) 'endpoint': endpoint,
        if (modelName != null && modelName!.isNotEmpty) 'modelName': modelName,
        if (apiKey != null && apiKey!.isNotEmpty) 'apiKey': apiKey,
      };

  ModelProviderConfig copyWith({
    String? mode,
    String? endpoint,
    String? modelName,
    String? apiKey,
  }) {
    return ModelProviderConfig(
      mode: mode ?? this.mode,
      endpoint: endpoint ?? this.endpoint,
      modelName: modelName ?? this.modelName,
      apiKey: apiKey ?? this.apiKey,
    );
  }
}
