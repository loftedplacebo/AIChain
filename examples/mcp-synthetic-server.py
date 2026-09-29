"""Synthetic MCP stdio acceptance fixture; no external access or governance key.

The customer-owned SDK launches this fixture only in explicit transport tests.
Stdout is reserved for MCP protocol messages.
"""
import argparse
import os
from pathlib import Path
from mcp import types
from mcp.server import MCPServer

server = MCPServer('orvessian-synthetic-stdio')

@server.tool()
def lookup(text: str) -> str:
    """Return caller-owned synthetic text unchanged."""
    return text

@server.tool()
def failed() -> types.CallToolResult:
    """Return a synthetic tool error without raising a process exception."""
    return types.CallToolResult(content=[types.TextContent(type='text', text='PRIVATE-MCP-ARGUMENT-RESULT-DO-NOT-CAPTURE')], is_error=True)

@server.tool()
def process_identity() -> str:
    """Identify the test subprocess; not captured by governance."""
    return str(os.getpid())

if __name__ == '__main__':
    if 'ORVESSIAN_TOKEN' in os.environ:
        raise RuntimeError('Synthetic tool server must not receive governance credentials')
    parser = argparse.ArgumentParser()
    parser.add_argument('--exit-marker')
    args = parser.parse_args()
    server.run(transport='stdio')
    if args.exit_marker:
        Path(args.exit_marker).write_text('stopped', encoding='utf-8')
