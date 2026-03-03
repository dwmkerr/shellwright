# Claude Code Basics Demo

Create a recording demonstrating Claude Code opening and responding to a greeting.

## Pacing

- Use `delay_ms` of 800-1000ms between steps for visible pacing
- Allow extra time (15-20 seconds) for Claude Code to respond

## Instructions

1. Start a shell session using `bash` with args `["--login", "-i"]` (80x24, one-dark theme)
2. Start recording at 10 FPS
3. Type `claude` and press Enter to launch Claude Code
4. Wait for Claude Code to fully initialize (look for the prompt)
5. Type `hi claude` and press Enter
6. Wait for Claude to respond (may take 10-20 seconds)
7. Once Claude responds, type `/exit` and press Enter to quit
8. Wait 1 second for clean exit
9. Stop recording and save as `recording.gif`

## Expected Result

A ~30-45 second GIF showing Claude Code launching, receiving a greeting, responding, and cleanly exiting.
