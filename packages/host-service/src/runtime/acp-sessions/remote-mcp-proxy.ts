/**
 * Bundled stdio bridge for ACP harnesses that cannot consume remote MCP
 * transports directly. mcp-remote owns the protocol and OAuth behavior; this
 * entry exists so packaged Superset can launch it without npx/npm discovery.
 */
import "mcp-remote/dist/proxy.js";
