# shell_attach

The `shell_attach` tool allows you to connect Shellwright to an existing terminal session. This makes it easier to create recordings from your own interactive sessions (rather than instructing an AI agent to do it).

Being able to attach to a shell allows you to write commands and scripts that start recording your screen - which can be trigged by things like [Claude Code slash commands](https://code.claude.com/docs/en/slash-commands).

Shell sessions must be running in [`tmux`](https://github.com/tmux/tmux/wiki) for this to work. When tmux wraps a shell it allows content to be captures - which is how this shell attach command works. Support for `screen` and vanilla shells is tracked in [#51](https://github.com/dwmkerr/shellwright/issues/51).

Technically, the process is:

```bash
shell_attach                        # walk up process tree to find PID with tty
ps -p $PID -o tty=                  # get tty device for that process
tmux list-panes -a | grep $TTY      # find tmux pane for the tty
tmux capture-pane -t $PANE -p -e    # capture pane content with ANSI codes
```

For a screenshot or recording:

```bash
shell_attach {tty} # starts capture loop (tmux → xterm buffer, polls every 100ms)
shell_screenshot   # reads xterm buffer once
shell_record_start # starts recording loop (xterm → PNG frames at configured FPS)
shell_record_stop  # stops recording loop, renders GIF
shell_detach       # stops capture loop, cleans up
```

## Usage

Start a tmux session, then run something like Claude code:

```bash
# Start tmux, then run Claude Code inside it
tmux new -s main
claude
```

Then attach to the terminal:

```bash
# Initialize MCP session (see scripts/mcp-init.sh)
SESSION=$(./scripts/mcp-init.sh)

# Attach to current terminal - pass your shell's TTY
./scripts/mcp-tool-call.sh $SESSION shell_attach "{\"tty\":\"$(tty)\"}"
```

Example response:

```json
{ "session_id": "shell-session-abc123" }
```

Note: `shell_attach` will only work when the Shellwright MCP server is running on the same host as the target terminal. Using the `stdio` transport should always work, and the `http` transport will work if running on the same host. The `http` transport on a remote host will not be able to access the local shell session.

The `session_id` can be used with `shell_screenshot`, `shell_record_start`, `shell_record_stop`, and `shell_read`.

Take a screenshot:

```bash
./scripts/mcp-tool-call.sh $SESSION shell_screenshot '{"session_id": "shell-session-abc123"}'
```

Example response:

```json
{ "filename": "screenshot.png", "download_url": "http://localhost:7498/files/..." }
```

Start a recording:

```bash
./scripts/mcp-tool-call.sh $SESSION shell_record_start '{"session_id": "shell-session-abc123"}'
```

Example response:

```json
{ "recording": true, "fps": 10 }
```

To stop recording:

```bash
./scripts/mcp-tool-call.sh $SESSION shell_record_stop '{"session_id": "shell-session-abc123"}'
```

Example response:

```json
{ "filename": "recording_1234567890.gif", "download_url": "http://localhost:7498/files/..." }
```

Detach the session with:

```bash
./scripts/mcp-tool-call.sh $SESSION shell_detach '{"session_id": "shell-session-abc123"}'
```

Example response:

```json
{ "success": true }
```
