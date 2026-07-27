/**
 * Tool-call firewall — pre-execution checks on model-emitted tool arguments.
 *
 * Distinct from the semantic firewall, which guards prompts *into* the model.
 * This module guards tool-call arguments *out of* the model before side effects run.
 *
 * Checks (in order):
 * 1. JSON Schema subset validation against the tool's paramSchema
 * 2. Strip undeclared properties when the schema declares `properties`
 * 3. Arg hygiene (control chars, length caps, path traversal) — recursive
 * 4. Sensitivity ceiling vs requestedSensitivity
 * 5. requiresApproval gate (unless approvalGranted or approval-meta tool)
 * 6. Optional numeric bound rewriting (clamp known size/time knobs)
 */

import type { Sensitivity } from "@envoymesh/protocol";

/** Per-string argument character ceiling (aligned with model prompt budget). */
export const MAX_TOOL_ARG_STRING_CHARS = 32_768;

/** Max items in any array argument. */
export const MAX_TOOL_ARG_ARRAY_ITEMS = 64;

/** Max nesting depth for hygiene / schema walks. */
const MAX_ARG_DEPTH = 8;

/** Path-like param keys that must not contain traversal. */
const PATH_LIKE_KEYS = new Set([
  "path",
  "relativePath",
  "vaultRelativePath",
  "savePath",
  "filePath",
]);

/** Tools that implement the approval queue itself — do not re-gate. */
const APPROVAL_META_TOOLS = new Set([
  "mesh.approve",
  "mesh.reject",
  "mesh.reject-all",
  "mesh.escalate",
  "mesh.list-pending",
  "mesh.list-all-approvals",
]);

/** Known numeric knobs — values above the cap are clamped (rewrite), not denied. */
const NUMERIC_CAPS: Record<string, number> = {
  maxBytes: 8_000_000,
  maxResponses: 25,
  limit: 100,
  timeoutMs: 120_000,
  ttl: 8,
  pollIntervalMs: 10_000,
  maxResults: 50,
};

const sensitivityRank: Record<Sensitivity, number> = {
  public: 0,
  friends: 1,
  trusted: 2,
  private: 3,
};

export type ToolCallFirewallAction = "allow" | "deny" | "approval_required";

export type ToolCallFirewallResult =
  | { ok: true; action: "allow"; params: Record<string, unknown>; rewrites: string[] }
  | { ok: false; action: "deny"; reason: string }
  | {
      ok: false;
      action: "approval_required";
      reason: string;
      params: Record<string, unknown>;
      rewrites: string[];
    };

/** Minimal JSON Schema subset used by ToolRegistry paramSchema. */
export interface ToolParamJsonSchema {
  type?: string;
  properties?: Record<string, ToolParamJsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: ToolParamJsonSchema;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface ToolCallFirewallTool {
  name: string;
  paramSchema: ToolParamJsonSchema | Record<string, unknown>;
  sensitivityCeiling: Sensitivity;
  requiresApproval: boolean;
}

export interface EvaluateToolCallFirewallInput {
  tool: ToolCallFirewallTool;
  params: Record<string, unknown>;
  /** True when owner (or an owner-trusted surface) has authorized this invocation. */
  approvalGranted?: boolean;
}

export function isApprovalMetaTool(toolName: string): boolean {
  return APPROVAL_META_TOOLS.has(toolName);
}

/**
 * Build a JSON Schema object from LocalToolDescriptor-style parameter lists.
 */
export function paramDescriptorsToJsonSchema(
  parameters: Array<{
    name: string;
    description?: string;
    type: "string" | "number" | "boolean" | "array" | "object";
    required: boolean;
  }>,
): ToolParamJsonSchema {
  const properties: Record<string, ToolParamJsonSchema> = {};
  const required: string[] = [];
  for (const p of parameters) {
    properties[p.name] = {
      type: p.type,
      description: p.description,
    };
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required };
}

/**
 * Evaluate tool-call arguments before execution.
 * On success (or approval_required after schema/hygiene), returns cleaned params.
 */
export function evaluateToolCallFirewall(
  input: EvaluateToolCallFirewallInput,
): ToolCallFirewallResult {
  const { tool } = input;
  const raw =
    input.params && typeof input.params === "object" && !Array.isArray(input.params)
      ? input.params
      : {};

  const schema = tool.paramSchema as ToolParamJsonSchema;
  const schemaError = validateAgainstJsonSchema(raw, schema, "");
  if (schemaError) {
    return { ok: false, action: "deny", reason: `tool_arg_schema: ${schemaError}` };
  }

  const params = stripUndeclaredProperties(raw, schema);

  const hygieneError = checkArgHygiene(params, "", 0);
  if (hygieneError) {
    return { ok: false, action: "deny", reason: `tool_arg_policy: ${hygieneError}` };
  }

  const sensitivityError = checkRequestedSensitivity(params, tool.sensitivityCeiling);
  if (sensitivityError) {
    return { ok: false, action: "deny", reason: `tool_arg_policy: ${sensitivityError}` };
  }

  const rewrites = applyNumericCaps(params);

  if (
    tool.requiresApproval &&
    !input.approvalGranted &&
    !isApprovalMetaTool(tool.name)
  ) {
    return {
      ok: false,
      action: "approval_required",
      reason: `tool_arg_approval: ${tool.name} requires owner approval before execution`,
      params,
      rewrites,
    };
  }

  return { ok: true, action: "allow", params, rewrites };
}

function validateAgainstJsonSchema(
  value: unknown,
  schema: ToolParamJsonSchema,
  path: string,
): string | undefined {
  const label = path || "params";

  if (schema.type === "object" || schema.properties || schema.required) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return `${label} must be an object`;
    }
    const obj = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      const v = obj[key];
      if (v === undefined || v === null) {
        return `missing required parameter: ${path ? `${path}.${key}` : key}`;
      }
      const propSchema = properties[key];
      if (
        (propSchema?.type === "string" || typeof v === "string") &&
        typeof v === "string" &&
        v.trim().length === 0
      ) {
        return `required parameter is empty: ${path ? `${path}.${key}` : key}`;
      }
    }
    for (const [key, propSchema] of Object.entries(properties)) {
      if (obj[key] === undefined) continue;
      const err = validateAgainstJsonSchema(
        obj[key],
        propSchema,
        path ? `${path}.${key}` : key,
      );
      if (err) return err;
    }
    return undefined;
  }

  if (schema.enum && schema.enum.length > 0) {
    if (!schema.enum.includes(value)) {
      return `${label} must be one of: ${schema.enum.map(String).join(", ")}`;
    }
  }

  if (!schema.type) {
    return undefined;
  }

  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return `${label} must be a string`;
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return `${label} is shorter than minLength ${schema.minLength}`;
      }
      const maxLen = schema.maxLength ?? MAX_TOOL_ARG_STRING_CHARS;
      if (value.length > maxLen) {
        return `${label} exceeds max length (${maxLen})`;
      }
      return undefined;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${label} must be a finite number`;
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        return `${label} is below minimum ${schema.minimum}`;
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        return `${label} exceeds maximum ${schema.maximum}`;
      }
      return undefined;
    }
    case "boolean":
      if (typeof value !== "boolean") return `${label} must be a boolean`;
      return undefined;
    case "array": {
      if (!Array.isArray(value)) return `${label} must be an array`;
      if (value.length > MAX_TOOL_ARG_ARRAY_ITEMS) {
        return `${label} exceeds max array items (${MAX_TOOL_ARG_ARRAY_ITEMS})`;
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i += 1) {
          const err = validateAgainstJsonSchema(value[i], schema.items, `${label}[${i}]`);
          if (err) return err;
        }
      }
      return undefined;
    }
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return `${label} must be an object`;
      }
      // Untyped nested objects (e.g. MCP `arguments`) — property checks happen in hygiene.
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * When the schema declares `properties`, drop undeclared keys (shallow + recursive
 * into declared nested object schemas that also declare properties).
 */
function stripUndeclaredProperties(
  params: Record<string, unknown>,
  schema: ToolParamJsonSchema,
): Record<string, unknown> {
  if (!schema.properties) {
    return { ...params };
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema.properties)) {
    if (params[key] === undefined) continue;
    const propSchema = schema.properties[key]!;
    const value = params[key];
    if (
      propSchema.properties &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out[key] = stripUndeclaredProperties(value as Record<string, unknown>, propSchema);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function checkArgHygiene(
  value: unknown,
  path: string,
  depth: number,
): string | undefined {
  if (depth > MAX_ARG_DEPTH) {
    return `${path || "params"} exceeds max nesting depth (${MAX_ARG_DEPTH})`;
  }

  if (typeof value === "string") {
    const label = path || "params";
    if (findDisallowedControlChar(value) !== undefined) {
      return `${label} contains disallowed control characters`;
    }
    if (value.length > MAX_TOOL_ARG_STRING_CHARS) {
      return `${label} exceeds max length (${MAX_TOOL_ARG_STRING_CHARS})`;
    }
    const key = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : path;
    const bareKey = key.replace(/\[\d+\]$/g, "");
    if (PATH_LIKE_KEYS.has(bareKey) || PATH_LIKE_KEYS.has(key)) {
      const pathErr = checkSafeRelativePath(value);
      if (pathErr) return `${label}: ${pathErr}`;
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    const label = path || "params";
    if (value.length > MAX_TOOL_ARG_ARRAY_ITEMS) {
      return `${label} exceeds max array items (${MAX_TOOL_ARG_ARRAY_ITEMS})`;
    }
    for (let i = 0; i < value.length; i += 1) {
      const err = checkArgHygiene(value[i], `${label}[${i}]`, depth + 1);
      if (err) return err;
    }
    return undefined;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      const err = checkArgHygiene(child, childPath, depth + 1);
      if (err) return err;
    }
  }

  return undefined;
}

function findDisallowedControlChar(text: string): number | undefined {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return i;
    if (code === 127) return i;
  }
  return undefined;
}

function decodePathSafely(raw: string): string {
  let current = raw;
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(current.replace(/\+/g, "%20"));
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function checkSafeRelativePath(raw: string): string | undefined {
  const decoded = decodePathSafely(raw);
  const normalized = decoded.replace(/\\/g, "/").trim();
  if (!normalized) return "path is empty";
  if (normalized.includes("\0")) return "path contains null bytes";
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return "absolute paths are not allowed";
  }
  const parts = normalized.split("/");
  if (parts.some((p) => p === "..")) {
    return "path traversal ('..') is not allowed";
  }
  return undefined;
}

function checkRequestedSensitivity(
  params: Record<string, unknown>,
  ceiling: Sensitivity,
): string | undefined {
  const raw = params.requestedSensitivity ?? params.sensitivity;
  if (typeof raw !== "string") return undefined;
  if (!(raw in sensitivityRank)) {
    return `invalid sensitivity "${raw}"`;
  }
  const requested = raw as Sensitivity;
  if (sensitivityRank[requested] > sensitivityRank[ceiling]) {
    return `requested sensitivity "${requested}" exceeds tool ceiling "${ceiling}"`;
  }
  return undefined;
}

function applyNumericCaps(params: Record<string, unknown>): string[] {
  const rewrites: string[] = [];
  for (const [key, cap] of Object.entries(NUMERIC_CAPS)) {
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value) && value > cap) {
      params[key] = cap;
      rewrites.push(`${key} clamped to ${cap}`);
    }
  }
  return rewrites;
}
