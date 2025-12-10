#!/usr/bin/env python3
"""
Echo Example - Basic shell interaction

Starts bash, runs echo command, captures output.

Usage:
    npm run dev  # start server first
    python examples/echo/run.py
"""

import asyncio
import json
import os
import sys

SERVER_URL = os.environ.get("SHELLWRIGHT_URL", "http://localhost:7498")


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

    try:
        async with streamablehttp_client(f"{SERVER_URL}/mcp") as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()

                # Start bash
                result = await call_tool(session, "shell_start", {"command": "bash"})
                session_id = json.loads(result)["session_id"]

                # Run echo command
                await call_tool(session, "shell_send", {
                    "session_id": session_id,
                    "input": "echo 'Hello from Shellwright!'\r",
                    "delay_ms": 500,
                })

                # Get snapshot and print it
                snapshot = await call_tool(session, "shell_snapshot", {
                    "session_id": session_id,
                })
                print(snapshot)

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
