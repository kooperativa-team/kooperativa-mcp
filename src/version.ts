import { createRequire } from "node:module";

/**
 * Server version, read from package.json at runtime so the identity string reported in the MCP
 * `initialize` response can never drift from the published package version.
 * dist/version.js sits one level below the package root, so "../package.json" resolves in both the
 * source tree and the published tarball.
 */
const require = createRequire(import.meta.url);
export const VERSION: string = (require("../package.json") as { version: string }).version;
