#!/bin/bash
# Initialize MCP session and output session ID
# Usage: ./scripts/mcp-init.sh [port]

PORT="${1:-7498}"
URL="http://localhost:${PORT}/mcp"

SESSION_ID=$(curl -s -D - -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mcp-cli","version":"1.0"}}}' \
  2>/dev/null | grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r')

if [ -z "$SESSION_ID" ]; then
  echo "[mcp-init] error: failed to get session ID" >&2
  exit 1
fi

echo "$SESSION_ID"
