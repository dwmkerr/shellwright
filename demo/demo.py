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
import base64
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

# ANSI colors
CYAN = "\033[36m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
DIM = "\033[2m"
RESET = "\033[0m"

# Defaults
DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o"


def mask_key(key: str) -> str:
    """Mask API key for display (max 10 chars)."""
    if len(key) <= 4:
        return "****"
    return key[:4] + "**..."


def get_config() -> dict:
    """Get config from env vars or prompt user."""
    config = {
        "shellwright_url": os.environ.get("SHELLWRIGHT_URL", "http://localhost:7498"),
        "output_dir": os.environ.get("SHELLWRIGHT_OUTPUT", "./output"),
    }

    # Base URL
    base_url = os.environ.get("OPENAI_BASE_URL")
    if base_url:
        config["base_url"] = base_url
    else:
        user_input = input(f"{DIM}Base URL [{DEFAULT_BASE_URL}]:{RESET} ").strip()
        config["base_url"] = user_input if user_input else DEFAULT_BASE_URL

    # API Key (required)
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        config["api_key"] = api_key
    else:
        api_key = input(f"{DIM}API Key (required):{RESET} ").strip()
        if not api_key:
            print("Error: API key is required", file=sys.stderr)
            sys.exit(1)
        config["api_key"] = api_key

    # Model
    model = os.environ.get("OPENAI_MODEL")
    if model:
        config["model"] = model
    else:
        user_input = input(f"{DIM}Model [{DEFAULT_MODEL}]:{RESET} ").strip()
        config["model"] = user_input if user_input else DEFAULT_MODEL

    return config


def log_config(config: dict):
    """Log config on startup."""
    print(f"{DIM}shellwright:{RESET} {config['shellwright_url']}")
    print(f"{DIM}base_url:{RESET} {config['base_url']}")
    print(f"{DIM}api_key:{RESET} {mask_key(config['api_key'])}")
    print(f"{DIM}model:{RESET} {config['model']}")
    print(f"{DIM}output:{RESET} {config['output_dir']}")
    print()


def crop_string(s: str, max_len: int = 80) -> str:
    """Crop string and add ellipsis if too long."""
    if len(s) <= max_len:
        return s
    return s[:max_len] + "..."


def format_args(args: dict) -> str:
    """Format args dict, cropping long values."""
    parts = []
    for k, v in args.items():
        if k == "session_id":
            continue
        if isinstance(v, str) and len(v) > 30:
            v = v[:30] + "..."
        parts.append(f"{k}={v!r}")
    return ", ".join(parts) if parts else ""


def format_response(text: str) -> str:
    """Format response, cropping base64 data."""
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "base64" in data:
            data["base64"] = data["base64"][:20] + "...[cropped]"
        return crop_string(json.dumps(data), 100)
    except (json.JSONDecodeError, TypeError):
        return crop_string(text, 100)


def save_base64_file(data: dict, output_dir: str) -> str | None:
    """Save base64 data to file, return path if saved."""
    if "base64" in data and "filename" in data:
        filepath = os.path.join(output_dir, data["filename"])
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(data["base64"]))
        return filepath
    return None


async def call_tool(session, name: str, args: dict):
    result = await session.call_tool(name, args)
    text = ""
    if result.content:
        for content in result.content:
            if hasattr(content, "text"):
                text += content.text
    return text


async def run(prompt: str, config: dict):
    try:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
        from openai import OpenAI
    except ImportError:
        print("Error: pip install mcp openai python-dotenv", file=sys.stderr)
        sys.exit(1)

    os.makedirs(config["output_dir"], exist_ok=True)

    try:
        async with streamablehttp_client(f"{config['shellwright_url']}/mcp") as (read, write, _):
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
                client = OpenAI(api_key=config["api_key"], base_url=config["base_url"])
                messages = [
                    {
                        "role": "system",
                        "content": """You control terminal applications using Shellwright tools.

Key sequences: arrow keys (\\x1b[A/B/C/D), Enter (\\r), Escape (\\x1b), Ctrl+C (\\x03)
Use descriptive names for screenshots and recordings.""",
                    },
                    {"role": "user", "content": prompt},
                ]

                while True:
                    response = client.chat.completions.create(
                        model=config["model"],
                        messages=messages,
                        tools=openai_tools,
                        tool_choice="auto",
                    )
                    message = response.choices[0].message

                    if not message.tool_calls:
                        print(f"\n{GREEN}output saved to:{RESET} {config['output_dir']}")
                        break

                    messages.append(message)
                    for tool_call in message.tool_calls:
                        name = tool_call.function.name
                        args = json.loads(tool_call.function.arguments)

                        # Show tool call (cyan)
                        args_str = format_args(args)
                        print(f"{CYAN}tool call:{RESET} {name}({args_str})", flush=True)

                        result_text = await call_tool(session, name, args)

                        # Show tool response (yellow)
                        print(f"{YELLOW}tool response:{RESET} {format_response(result_text)}", flush=True)

                        # Save files from screenshot/recording responses
                        llm_response = result_text
                        try:
                            data = json.loads(result_text)
                            saved_path = save_base64_file(data, config["output_dir"])
                            if saved_path:
                                print(f"{GREEN}saved:{RESET} {saved_path}", flush=True)
                            # Strip base64 before sending to LLM (too large, LLM can't use it)
                            if "base64" in data:
                                del data["base64"]
                                data["saved"] = True
                                llm_response = json.dumps(data)
                        except (json.JSONDecodeError, TypeError):
                            pass

                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": llm_response,
                        })

    except BaseException as e:
        import traceback
        # Unwrap TaskGroup/ExceptionGroup to show actual errors
        if hasattr(e, 'exceptions'):
            for sub_e in e.exceptions:
                print(f"Error: {type(sub_e).__name__}: {sub_e}", file=sys.stderr)
                traceback.print_exception(type(sub_e), sub_e, sub_e.__traceback__)
        elif "Connect" in str(type(e).__name__) or "connection" in str(e).lower():
            print("Error: Shellwright MCP server not running - try 'npm run dev'", file=sys.stderr)
        else:
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    config = get_config()
    log_config(config)

    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])
    else:
        prompt = input("User (enter message): ")
    asyncio.run(run(prompt, config))
