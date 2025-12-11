#!/usr/bin/env python3
"""
Shellwright Demo - Natural language terminal control

Usage:
    npm run dev  # start server first
    python examples/demo.py "Open vim, type hello, take a screenshot, then quit"
    python examples/demo.py  # prompts for input

Requires: pip install mcp openai python-dotenv
"""

import asyncio
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

SERVER_URL = os.environ.get("SHELLWRIGHT_URL", "http://localhost:7498")
SCREENSHOT_DIR = os.environ.get("SHELLWRIGHT_SCREENSHOTS", "/tmp/shellwright")
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")


async def call_tool(session, name: str, args: dict):
    result = await session.call_tool(name, args)
    text = ""
    if result.content:
        for content in result.content:
            if hasattr(content, "text"):
                text += content.text
    return text


async def run(prompt: str):
    try:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
        from openai import OpenAI
    except ImportError:
        print("Error: pip install mcp openai python-dotenv", file=sys.stderr)
        sys.exit(1)

    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    try:
        async with streamablehttp_client(f"{SERVER_URL}/mcp") as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()

                # Get MCP tools and convert to OpenAI format
                tools_result = await session.list_tools()
                openai_tools = [{
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description or "",
                        "parameters": t.inputSchema,
                    },
                } for t in tools_result.tools]

                # Run agent loop
                client = OpenAI()
                messages = [
                    {
                        "role": "system",
                        "content": f"""You control terminal applications using Shellwright tools.

Key sequences: arrow keys (\\x1b[A/B/C/D), Enter (\\r), Escape (\\x1b), Ctrl+C (\\x03)
Save screenshots to {SCREENSHOT_DIR}/ with descriptive names.""",
                    },
                    {"role": "user", "content": prompt},
                ]

                while True:
                    response = client.chat.completions.create(
                        model=MODEL,
                        messages=messages,
                        tools=openai_tools,
                        tool_choice="auto",
                    )
                    message = response.choices[0].message

                    if not message.tool_calls:
                        break

                    messages.append(message)
                    for tool_call in message.tool_calls:
                        name = tool_call.function.name
                        args = json.loads(tool_call.function.arguments)

                        result_text = await call_tool(session, name, args)

                        # Print screenshot paths
                        if name == "shell_screenshot" and "output" in args:
                            print(f"{args['output']}.png")

                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": result_text,
                        })

    except Exception as e:
        if "Connect" in str(type(e).__name__) or "connection" in str(e).lower():
            print("Error: Shellwright MCP server not running - try 'npm run dev'", file=sys.stderr)
        else:
            print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])
    else:
        prompt = input("Enter Message: ")
    asyncio.run(run(prompt))
