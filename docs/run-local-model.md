# Running a Local Model Provider (Ollama / LiteLLM)

EnvoyMesh supports local model providers for knowledge queries and chat assistance, keeping data private and enabling offline operation.

---

## Quick Start with Ollama

### 1. Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download from https://ollama.com/download
```

### 2. Pull a model

```bash
ollama pull llama3.1        # ~5GB, good general purpose
ollama pull llama3.1:70b   # larger, more capable (needs 60GB+ RAM)
ollama pull mistral        # ~4GB, efficient
ollama pull nomic-embed-text  # for embedding (if supported)
```

### 3. Verify Ollama is running

```bash
curl http://127.0.0.1:11434/api/version
# {"version":"0.1.50"}
```

### 4. Configure EnvoyMesh to use Ollama

```bash
# Using the node CLI (when the node is not running):
npm run cli -w @envoymesh/node -- model-config --profile ./data/default
# Model config: mode=mock

# Update via the WebSocket RPC API (from the Social app or a script):
# Or set in node-config.json directly:
```

Edit `data/default/node-config.json`:

```json
{
  "modelProviders": {
    "mode": "ollama",
    "endpoint": "http://127.0.0.1:11434",
    "modelName": "llama3.1"
  }
}
```

### 5. Start the node

```bash
npm run node:dev
# ...
# [model] provider mode=ollama
```

---

## LiteLLM (Ollama as a LiteLLM target)

LiteLLM lets you use Ollama (and other local models) through an OpenAI-compatible HTTP API, which EnvoyMesh uses natively.

### 1. Install LiteLLM

```bash
pip install litellm
# or
brew install litellm  # macOS with Homebrew
```

### 2. Run LiteLLM proxy with Ollama backend

```bash
litellm \
  --model ollama/llama3.1 \
  --port 4000
```

Or create a `config.yaml`:

```yaml
model_list:
  - model_name: llama3.1
    litellm_params:
      model: ollama/llama3.1
      api_base: http://127.0.0.1:11434

litellm_settings:
  drop_params: true
  set_verbose: true
```

Run: `litellm --config config.yaml --port 4000`

### 3. Verify

```bash
curl http://127.0.0.1:4000/v1/models
```

### 4. Configure EnvoyMesh

Edit `data/default/node-config.json`:

```json
{
  "modelProviders": {
    "mode": "litellm",
    "endpoint": "http://127.0.0.1:4000/v1",
    "modelName": "llama3.1"
  }
}
```

---

## Cloud Models (LiteLLM with OpenAI / Anthropic / etc.)

### 1. Set API key

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Configure LiteLLM with cloud endpoints

```yaml
model_list:
  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini
  - model_name: claude-3-haiku
    litellm_params:
      model: anthropic/claude-3-haiku-20240307
```

Run: `litellm --config config.yaml --port 4000`

### 3. Configure EnvoyMesh

Edit `data/default/node-config.json`:

```json
{
  "modelProviders": {
    "mode": "litellm",
    "endpoint": "http://127.0.0.1:4000/v1",
    "modelName": "gpt-4o-mini",
    "requireApprovalForCloud": true
  }
}
```

**Important**: `requireApprovalForCloud: true` (the default) means the node will ask for your approval before sending any non-public data to the cloud provider. This prevents accidental private data leakage.

---

## Model Provider Modes

| Mode | Description | Privacy | Setup |
|------|-------------|---------|-------|
| `mock` | Built-in mock responses (no external call) | N/A | Default, no setup |
| `ollama` | Direct Ollama HTTP API | Full (local) | Ollama running on port 11434 |
| `litellm` | LiteLLM proxy (OpenAI-compatible) | Depends on backend | LiteLLM proxy running |
| `disabled` | No model calls allowed | N/A | No setup |

---

## Inspecting Current Model Config

```bash
# Via CLI
npm run cli -w @envoymesh/node -- model-config --profile ./data/default

# Example output:
# Model provider configuration
#   mode           ollama
#   endpoint       http://127.0.0.1:11434
#   modelName      llama3.1
```

---

## Troubleshooting

### Ollama not responding

```bash
# Check Ollama is running
ps aux | grep ollama

# Restart Ollama
ollama serve

# Test directly
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "llama3.1",
  "prompt": "Hello",
  "stream": false
}'
```

### LiteLLM proxy errors

```bash
# Check LiteLLM logs for details
# Common issues:
# - Wrong api_base URL (must include full path, e.g. http://host:port)
# - Model name format: "ollama/llama3.1" not just "llama3.1"
# - Missing API keys for cloud providers
```

### Model returns empty response

```bash
# Verify model is downloaded and works standalone
ollama show llama3.1
ollama run llama3.1 "What is 2+2?"

# Check EnvoyMesh logs for model routing errors
# Look for: [model] provider mode=ollama
# If you see mode=mock, the config wasn't picked up
```

### Config not being read

The node must be **restarted** after editing `node-config.json` for changes to take effect.

---

## Security Notes

- **Local models (ollama)**: All data stays on your machine. No data leaves.
- **LiteLLM proxy on localhost**: Same as above — data doesn't leave unless LiteLLM is configured to forward to a cloud provider.
- **Cloud providers**: Require `requireApprovalForCloud: true` (default). The node will prompt for approval before sending non-public data to cloud endpoints.
- **API keys**: Store in environment variables, not in `node-config.json` in plain text.
