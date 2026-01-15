#!/bin/bash
# Call an MCP tool
# Usage: ./scripts/mcp-tool-call.sh <session_id> <tool_name> [args_json]
# Example: ./scripts/mcp-tool-call.sh $SESSION shell_start '{"command":"bash"}'

SESSION_ID="$1"
TOOL_NAME="$2"
ARGS_JSON="${3:-{}}"
PORT="${4:-7498}"

if [ -z "$SESSION_ID" ] || [ -z "$TOOL_NAME" ]; then
  echo "Usage: $0 <session_id> <tool_name> [args_json] [port]" >&2
  exit 1
fi

URL="http://localhost:${PORT}/mcp"

REQUEST=$(cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"$TOOL_NAME","arguments":$ARGS_JSON}}
EOF
)

curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d "$REQUEST" \
  2>/dev/null | grep "^data:" | sed 's/^data: //' | jq -r '.result.content[0].text // .error.message // .'
