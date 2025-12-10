#!/usr/bin/env python3
"""
K9s Example - Kubernetes TUI interaction

Opens k9s, navigates to deployments, takes screenshots.

Usage:
    npm run dev  # start server first
    python examples/k9s/run.py
"""

import asyncio
import json
import os
import sys

SERVER_URL = os.environ.get("SHELLWRIGHT_URL", "http://localhost:7498")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")


async def call_tool(session, name: str, args: dict):
    result = await session.call_tool(name, args)
    text = ""
    if result.content:
        for content in result.content:
            if hasattr(content, "text"):
                text += content.text
    return text


async def run():
    try:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
    except ImportError:
        print("Error: pip install mcp", file=sys.stderr)
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    try:
        async with streamablehttp_client(f"{SERVER_URL}/mcp") as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()

                # Start k9s
                result = await call_tool(session, "shell_start", {
                    "command": "k9s",
                    "cols": 120,
                    "rows": 40,
                })
                session_id = json.loads(result)["session_id"]

                # Wait for k9s to load
                await call_tool(session, "shell_send", {
                    "session_id": session_id,
                    "input": "",
                    "delay_ms": 3000,
                })

                # Screenshot: initial view
                await call_tool(session, "shell_screenshot", {
                    "session_id": session_id,
                    "output": f"{OUTPUT_DIR}/step-01-k9s",
                })
                print(f"{OUTPUT_DIR}/step-01-k9s.png")

                # Navigate to deployments
                await call_tool(session, "shell_send", {
                    "session_id": session_id,
                    "input": ":deploy\r",
                    "delay_ms": 2000,
                })

                # Screenshot: deployments view
                await call_tool(session, "shell_screenshot", {
                    "session_id": session_id,
                    "output": f"{OUTPUT_DIR}/step-02-deployments",
                })
                print(f"{OUTPUT_DIR}/step-02-deployments.png")

                # Exit k9s
                await call_tool(session, "shell_send", {
                    "session_id": session_id,
                    "input": ":q\r",
                    "delay_ms": 500,
                })

                # Stop session
                await call_tool(session, "shell_stop", {"session_id": session_id})

    except Exception as e:
        if "Connect" in str(type(e).__name__) or "connection" in str(e).lower():
            print("Error: Shellwright MCP server not running - try 'npm run dev'", file=sys.stderr)
        else:
            print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run())
