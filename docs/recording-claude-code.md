# Recording Claude Code Sessions

Notes from driving a real interactive Claude Code session with Shellwright
(via a scripted MCP client, no human at the keyboard). What works, what
bites, and a proven recipe.

## The short version

1. Start a plain shell first, `cd` and set `PS1` *before* `shell_record_start`.
2. Launch with `claude --model sonnet` inside the recorded shell.
3. Send question text and the submitting `\r` as **two separate**
   `shell_send` calls, ~1-2s apart. A trailing `\r` inside one send can be
   swallowed by bracketed paste.
4. Detect "Claude is working" with `esc to interrupt` or the spinner shape
   `/ for \d+s/` in the buffer. Do **not** match spinner verbs — they are
   random gerunds ("Churned", "Cooked", "Brewed", ...).
5. Detect "done" as: no busy marker AND buffer unchanged across 2-3 polls
   (2s apart).
6. Unset `CLAUDECODE` / `CLAUDE_CODE_ENTRYPOINT` in the shell if the driver
   itself runs under Claude Code, or the nested TUI may behave differently.
7. Expect a first-run trust dialog in fresh directories; answer with `\r`.

A working adaptive driver (poll buffer, infer UI state, retry the Enter key
only — never retype the question) is at
[`docs/examples/drive-claude.mjs`](examples/drive-claude.mjs). It predates
`shell_wait_for` and shows the manual polling approach; with the new tool the
wait loops collapse to single calls.

## Pitfalls found in real use

| Pitfall | Symptom | Fix / recommendation |
|---|---|---|
| Port conflict crashed silently | startup banner prints, process dies; POST /mcp answered with Express 404 by the *old* process that owns the port | fixed: `listen` errors are now handled - HTTP mode exits loudly on `EADDRINUSE`, stdio mode warns |
| `node-pty` built for old Node | `Cannot find module ../build/Debug/pty.node` | `npm rebuild node-pty`; startup could catch this and print the fix |
| Retyping unverified input | question appears 2-3x in the TUI input box | verify by *submitting* again (`\r`), never resend the text; or use `shell_send` with `submit: true` |
| Long silent turns → sparse GIF frames | 75s of thinking = 1-2 frames, answer flashes at the end | fixed: `shell_record_stop` now holds the final frame (`hold_last_ms`, default 2s) |

## Tooling added for this workflow

- **`shell_wait_for`** — `{pattern, absent_pattern, stable_ms, timeout_ms}`.
  Replaces client-side `shell_read` polling loops when driving any TUI
  (Claude Code, vim, k9s).
- **`shell_send` `submit: true`** — paste text, settle delay
  (`submit_delay_ms`, default 1s), then Enter as a separate keystroke. The
  paste-then-submit pattern every chat TUI needs.
- **`shell_record_stop` `hold_last_ms`** — holds the final frame (default
  2000ms) so the ending doesn't flash past before the GIF loops.

## Remaining ideas

- **`speed` option on record stop** — a 5-minute Claude turn should compress
  to a ~20s GIF; wall-clock playback of thinking time is dead air.
- **Startup hint for broken `node-pty`** — catch the native-module load error
  and print `npm rebuild node-pty`.

## Reference driver

[`docs/examples/drive-claude.mjs`](examples/drive-claude.mjs) is the adaptive
driver used to record a real session (two questions, file citations in the
answers) against an [Ark](https://github.com/mckinsey/agents-at-scale-ark)
OKF bundle. Core loop:

```js
// busy: Claude Code shows "esc to interrupt" while streaming, and a
// "<Gerund> for NNs" spinner while thinking - match the shape, not the verb.
const busy =
  buf.includes('esc to interrupt') || / for \d+s/.test(buf.slice(-500));

// idle: no busy marker AND buffer stable across 3 polls, 2s apart
```

Submit questions like this:

```js
await send(question, 1200);   // paste text into the input box
await sleep(2000);            // let the TUI render it
await send('\r', 500);        // submit as a separate keystroke
// if no busy marker within ~6s, re-send '\r' only (never the text)
```
