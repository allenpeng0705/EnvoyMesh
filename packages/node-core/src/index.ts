/**
 * @envoymesh/node-core — the small shared core that sits between a home node
 * app and the harness/agent layer.
 *
 * Seven cross-cutting modules, kept here because **both** the node app and
 * `@envoymesh/harness` consume them:
 *
 * | Module | Concern |
 * |---|---|
 * | `service-ports` | port bases/defaults + env offsets, derived URLs |
 * | `envoymesh-home` | where the owner's profile lives — one root per machine, shared by products |
 * | `profile-discovery` | what to tell the user about that profile, in their words |
 * | `node-registry` | who owns that home right now: the lock, the endpoint, the identity probe |
 * | `product-attach` | how a second app joins: the attach method, the `product:<Name>` scope, and which app a pairing code belongs to |
 * | `home-fs` | cross-platform home-node filesystem helpers |
 * | `mmx-media-slash` | shared MiniMax media slash-command descriptors |
 */
export * from "./service-ports.js";
export * from "./envoymesh-home.js";
export * from "./profile-discovery.js";
export * from "./node-registry.js";
export * from "./product-attach.js";
export * from "./home-fs.js";
export * from "./mmx-media-slash.js";
