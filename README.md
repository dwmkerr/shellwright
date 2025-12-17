<p align="center">
  <h2 align="center"><code>🖥️ shellwright</code></h2>
  <h3 align="center">Playwright for the shell. AI-driven terminal automation, screenshots and video recording.</h3>
  <h4 align="center">Finally. Your AI agents can <a href="https://stackoverflow.com/questions/11828270/how-do-i-exit-vim" target="_blank">close Vim</a></h4>
  <p align="center"><em>
    User: Open Vim. Tell me how to close it. Close it. Record this as a video.
  </em></p>
  <p align="center">
    <img src="./docs/examples/vim-close.gif" alt="Shellwright Demo" style="max-width: 100%;">
  </p>
  <p align="center">
    <a href="#quickstart">Quickstart</a> |
    <a href="#examples">Examples</a> |
    <a href="#mcp-tools">MCP Tools</a> |
    <a href="#configuration">Configuration</a>
  </p>
  <p align="center">
    <a href="https://github.com/dwmkerr/shellwright/actions/workflows/cicd.yaml"><img src="https://github.com/dwmkerr/shellwright/actions/workflows/cicd.yaml/badge.svg" alt="cicd"></a>
    <a href="https://www.npmjs.com/package/@dwmkerr/shellwright"><img src="https://img.shields.io/npm/v/@dwmkerr/shellwright" alt="npm version"></a>
  </p>
</p>

## Quickstart

Configure your LLM, IDE or whatever to use the Shellwright MCP server:

```json
{
  "mcpServers": {
    "shellwright": {
      "command": "npx",
      "args": ["-y", "@dwmkerr/shellwright"]
    }
  }
}
```

Use a prompt such as "Open Vim. Write a message saying how to close Vim. Close Vim. Give me a screenshot of each step and a GIF recording." or check the [Examples](#examples).

**Running Locally**

Run the MCP server:

```bash
npm install
npm run dev
```

The server runs at `http://localhost:7498/mcp`.

**Testing with the MCP Inspector**

Open the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) in another terminal and connect to `http://localhost:7498/mcp` to list and test tools:

```bash
# Open MCP inspector in another terminal.
npx @modelcontextprotocol/inspector

# Now connect to:
# http://localhost:7498/mcp
```

**Testing with an Agent**

Run the [`demo.py`](./demo/demo.py) program to chat to an agent that has the Shellwright tool:

```bash
# Optionally setup your .env to specify configuration.
# cp ./demo/.env.sample .env && vi .env

# Install requirements and run the agent.
pip install -r ./demo/requirements.txt
python ./demo/demo.py

# Output:
# User (enter message): Show me what the htop tool looks like showing me my resources.

# ...or provide a message directly.
python ./demo/demo.py -- "Run a shell command to show me the names \
of the folders in this directory and take a screenshot and give me its path"
```

You will see logs from the MCP server and the demo agent:

![Screenshot of the MCP server and demo agent](./docs/images/npm-dev-and-demo-screenshot.png)

Screenshots and videos by default will be written to `./output`.

## Examples

Have fun with some prompts.

Do some Vim stuff:

> Open Vim. Write a message saying how to close Vim. Close Vim. Give me a screenshot of each step and a GIF recording.

![Screenshot: Examples - Vim](./docs/examples/vim-close.gif)

Open [`k9s`](https://k9scli.io/) and show [Ark](https://github.com/mckinsey/agents-at-scale-ark) agents:

> Open K9S. Check for resources of type 'agents'. Give me a GIF recording and take screenshots along the way.

![Screenshot: Examples - K9S Agents](./docs/examples/k9s-agents.gif)

## MCP Tools

| Tool | Description |
|------|-------------|
| `shell_start` | Start a new PTY session |
| `shell_send` | Send input to a session |
| `shell_read` | Read the terminal buffer |
| `shell_screenshot` | Capture terminal as PNG, ANSI, and plain text |
| `shell_record_start` | Start recording for GIF export |
| `shell_record_stop` | Stop recording and export GIF |
| `shell_stop` | Stop a PTY session |

## Configuration

| Variable | Parameter | Default | Description |
|----------|-----------|---------|-------------|
| `PORT` | `--port`, `-p` | `7498` | Server port ("SWRT" on a phone keypad) |
| `THEME` | `--theme`, `-t` | `one-dark` | Color theme (`one-dark`, `one-light`, `dracula`, `solarized-dark`, `nord`) |
| `TEMP_DIR` | `--temp-dir` | `/tmp/shellwright` | Directory for recording frames |
| `FONT_SIZE` | `--font-size` | `14` | Font size in pixels for screenshots/recordings |
| `FONT_FAMILY` | `--font-family` | `Hack, Monaco, Courier, monospace` | Font family for screenshots/recordings (use a font with bold variant for bold text support) |
| - | `--cols` | `120` | Default terminal columns |
| - | `--rows` | `40` | Default terminal rows |

Some configuration can also be provided by the LLM, simply prompt for it:

- Terminal Dimensions: e.g: "Use a terminal that is 80x24 for the recording"

## Troubleshooting

The MCP server by default will write screenshots, video frames and the GIF (if requested) to a temporary location. This location includes the MCP session ID and the Shell session ID (one MCP session can have many shell sessions):

```bash
# Show the contents of an MCP and shell session.
tree /tmp/shellwright/mcp-session-16281bdf-7881-458a-8bee-475b02d000d2/shell-session-c66b8a

# Output:
# .
# ├── frames                         # Frames for the GIF recording. These are 
# │   └── frame000000.png            # cleaned up at the end of the session.
# ├── recordings
# │   └── vim_tutorial_complete.gif  # The GIF recording (if requested).
# └── screenshots
# ├── step1_initial_terminal.ansi    # Individual screenshot w/ ansi color etc.
# ├── step1_initial_terminal.png     # Screenshot as PNG (ANSI->SVG->PNG).
# └── step1_initial_terminal.svg     # The SVG intermediate.
# └── step1_initial_terminal.txt     # Screenshot as plain text.
```

You can check raw `txt` files to troubleshoot the contents of screenshots. You can see the `ansi` content which contains formatting and color codes. Finally, you can open the `png` files - these are generated by converting the `ansi` to SVG (using themes defined in code) and then SVG is converted PNG. Check the plain text contents of a buffer, or raw ansi, or formatted like so:

```bash
# Show plain text. Make sure you are in the shell session temp directory.
cat ./k9s_initial_view.txt

# Show formatted ANSI. Good for troubleshooting color codes.
cat ./k9s_initial_view.ansi
```

## TODO

Ideas for the future.

- Video export (MP4/MOV) via ffmpeg
- Set screen size tool
- Better logging, a bit like `hl`

## License

MIT
