# EMP/0.1 JSON Schema bundle

Machine-readable schemas generated from `@envoymesh/protocol` (Zod 4 `toJSONSchema()`, draft **2020-12**).

**Regenerate after schema changes:**

```bash
npm run export-schemas -w @envoymesh/protocol
```

**Normative behavior:** [docs/protocol-standard.md](../../../docs/protocol-standard.md)  
**Implementer guide:** [docs/emp-implementers-guide.md](../../../docs/emp-implementers-guide.md)

| File | Description |
|------|-------------|
| `index.json` | Manifest of all schemas |
| `unsigned-envelope.json` | Unsigned EMP envelope (add `signature` after signing) |
| `knowledge-response-payload.json` | Includes optional `suggestedRelativePath` |
| `mandate.json` | Signed standing / task mandate |
| … | See `index.json` |

**Note:** Zod `superRefine` rules (e.g. role policy) are documented in the spec, not fully expressible in JSON Schema. Validate with `@envoymesh/protocol` parsers in CI when possible.
