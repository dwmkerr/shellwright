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

# Attach to current terminal (see scripts/mcp-tool-call.sh)
./scripts/mcp-tool-call.sh $SESSION shell_attach
```

Example response:

```json
{ "session_id": "shell-session-abc123" }
```

The `session_id` can be used with `shell_screenshot`, `shell_record_start`, `shell_record_stop`, and `shell_read`.

With the session successfully attached, you can start and stop a recording:

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
