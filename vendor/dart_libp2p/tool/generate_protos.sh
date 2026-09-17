#!/bin/bash
set -e  # Exit on error

# Get the path to protoc-gen-dart
PROTOC_PLUGIN=$(which protoc-gen-dart)
if [ -z "$PROTOC_PLUGIN" ]; then
    PROTOC_PLUGIN="$HOME/.pub-cache/bin/protoc-gen-dart"
    if [ ! -f "$PROTOC_PLUGIN" ]; then
        echo "Installing protoc-gen-dart..."
        dart pub global activate protoc_plugin
    fi
fi

# Add the protoc-gen-dart to the PATH
export PATH="$PATH:$(dirname $PROTOC_PLUGIN)"


echo "Generating Dart protobuf files..."
echo "Using protoc-gen-dart from: $PROTOC_PLUGIN"
echo "Proto file location: lib/src/core/crypto/pb/crypto.proto"

# Generate Dart files from proto with correct package structure
protoc --dart_out=. \
       --experimental_allow_proto3_optional \
       lib/src/core/crypto/pb/crypto.proto

echo "Generation complete. Checking for generated files..."
ls -l lib/src/core/crypto/pb/crypto.pb.dart || echo "Warning: crypto.pb.dart was not generated!" 