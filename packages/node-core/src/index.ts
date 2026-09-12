/**
 * @envoymesh/node-core — the small shared core that sits between a home node
 * app and the harness/agent layer.
 *
 * Three cross-cutting modules, kept here because **both** the node app and
 * `@envoymesh/harness` consume them:
 *
 * | Module | Concern |
 * |---|---|
 * | `service-ports` | port bases/defaults + env offsets, derived URLs |
 * | `home-fs` | cross-platform home-node filesystem helpers |
 * | `mmx-media-slash` | shared MiniMax media slash-command descriptors |
 */
export * from "./service-ports.js";
export * from "./home-fs.js";
export * from "./mmx-media-slash.js";
