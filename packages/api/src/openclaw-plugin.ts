/**
 * Types for OpenClaw extension/plugin management.
 *
 * These types describe the shape of plugin data returned by the node
 * service, which calls OpenClaw's plugin discovery, install, and
 * lifecycle functions from `packages/openclaw/src/plugins/`.
 */

/** Summary info for a single plugin (used in list views). */
export interface OpenClawPluginInfo {
  id: string;
  name: string;
  version?: string;
  description?: string;
  /** Where the plugin was loaded from. */
  origin: "bundled" | "global" | "workspace" | "config";
  /** Whether the plugin is currently enabled in the gateway config. */
  enabled: boolean;
  /** Channel IDs contributed by this plugin (e.g. "envoymesh"). */
  channels?: string[];
  /** Tool names contributed by this plugin. */
  tools?: string[];
}

/** Extended detail for a single plugin (used in inspect/detail views). */
export interface OpenClawPluginDetail extends OpenClawPluginInfo {
  /** JSON Schema for the plugin's config section (if any). */
  configSchema?: unknown;
  /** Plugin contributions (channels, tools, memory slots, etc.). */
  contributions?: unknown;
  /** Install provenance — only present for non-bundled plugins. */
  installRecord?: {
    source: "npm" | "git" | "clawhub" | "marketplace" | "path";
    spec: string;
    version: string;
    installPath: string;
  };
}
