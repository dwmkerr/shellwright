# Shellwright MCP Server

Playwright for the shell. An MCP server that lets AI agents record, capture, and automate terminal sessions.

## Concept

Just as [Playwright](https://playwright.dev/) automates browsers, **Shellwright** automates terminals. It provides MCP tools for AI agents to:

- Record terminal sessions as shareable casts or GIFs
- Take "screenshots" of terminal state
- Execute commands and capture output with timing
- Create reproducible shell recordings from scripts

## Proposed MCP Tools

### `shell_record_start`
Start recording a terminal session.

```json
{
  "session_id": "my-session",
  "shell": "bash",
  "cols": 80,
  "rows": 24
}
```

### `shell_record_stop`
Stop recording and save the session.

```json
{
  "session_id": "my-session",
  "format": "cast",
  "output": "session.cast"
}
```

### `shell_execute`
Execute a command in a recorded session.

```json
{
  "session_id": "my-session",
  "command": "ls -la",
  "delay_after": 500
}
```

### `shell_screenshot`
Capture the current terminal state as an image.

```json
{
  "session_id": "my-session",
  "output": "terminal.png"
}
```

### `shell_export`
Export a recording to different formats.

```json
{
  "session_id": "my-session",
  "format": "gif",
  "output": "demo.gif"
}
```

## Use Cases

### 1. Documentation
AI agents can create terminal recordings for documentation:
```
"Record me installing the project and running the tests"
```

### 2. PR Attachments
Capture terminal output as images or GIFs for pull requests.

### 3. Tutorials
Create step-by-step terminal demos with proper timing and pauses.

### 4. Debugging
Record a debugging session to share with others.

## Implementation Ideas

### Option A: Wrap asciinema
Use [asciinema](https://asciinema.org/) for recording and [agg](https://github.com/asciinema/agg) for GIF conversion.

```
asciinema rec → .cast file → agg → .gif
```

### Option B: Wrap VHS
Use [VHS](https://github.com/charmbracelet/vhs) for scripted recordings.

```yaml
# demo.tape
Set Shell bash
Type "echo hello"
Enter
Sleep 1s
```

### Option C: Custom PTY
Spawn a pseudo-terminal, capture output with timing, render with a library.

## Example Workflow

```
User: "Create a GIF showing how to install and run the project"

Agent:
1. shell_record_start { session_id: "install-demo" }
2. shell_execute { command: "git clone ..." }
3. shell_execute { command: "cd project && npm install" }
4. shell_execute { command: "npm start" }
5. shell_record_stop { }
6. shell_export { format: "gif", output: "install-demo.gif" }
```

## Status

🚧 **Proof of Concept** - This is an idea for an MCP server, not yet implemented.

## Prior Art

- [Playwright MCP](https://github.com/anthropics/mcp-server-playwright) - Browser automation
- [asciinema](https://asciinema.org/) - Terminal recording
- [VHS](https://github.com/charmbracelet/vhs) - Scripted terminal GIFs
- [terminalizer](https://github.com/faressoft/terminalizer) - Terminal to GIF
- [svg-term-cli](https://github.com/marionebl/svg-term-cli) - asciinema to SVG

## License

MIT
