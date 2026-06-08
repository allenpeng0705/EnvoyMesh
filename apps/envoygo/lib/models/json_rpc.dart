// JSON-RPC 2.0 protocol types for communication with the home node.
// Mirrors the wire format used by `ws-protocol.ts` on the TypeScript side.

/// A JSON-RPC request sent to the home node.
class JsonRpcRequest {
  final String id;
  final String method;
  final Map<String, dynamic>? params;

  const JsonRpcRequest({
    required this.id,
    required this.method,
    this.params,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'method': method,
        if (params != null) 'params': params,
      };
}

/// A JSON-RPC response from the home node.
class JsonRpcResponse {
  final String id;
  final dynamic result;
  final JsonRpcError? error;

  const JsonRpcResponse({
    required this.id,
    this.result,
    this.error,
  });

  factory JsonRpcResponse.fromJson(Map<String, dynamic> json) {
    return JsonRpcResponse(
      id: json['id'] as String,
      result: json['result'],
      error: json['error'] != null
          ? JsonRpcError.fromJson(json['error'] as Map<String, dynamic>)
          : null,
    );
  }

  bool get isError => error != null;
}

/// A JSON-RPC error object.
class JsonRpcError {
  final int code;
  final String message;
  final dynamic data;

  const JsonRpcError({
    required this.code,
    required this.message,
    this.data,
  });

  factory JsonRpcError.fromJson(Map<String, dynamic> json) {
    return JsonRpcError(
      code: json['code'] as int,
      message: json['message'] as String,
      data: json['data'],
    );
  }
}

/// A server-pushed event (no id field).
class JsonRpcEvent {
  final String event;
  final Map<String, dynamic>? data;

  const JsonRpcEvent({
    required this.event,
    this.data,
  });

  factory JsonRpcEvent.fromJson(Map<String, dynamic> json) {
    return JsonRpcEvent(
      event: json['event'] as String,
      data: json['data'] as Map<String, dynamic>?,
    );
  }
}
