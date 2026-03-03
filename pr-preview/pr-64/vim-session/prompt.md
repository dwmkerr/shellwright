# Vim Close Demo

Create a recording demonstrating how to close vim.

## Pacing

- Use `delay_ms` of 800-1000ms between steps for visible pacing
- Execute tool calls quickly without unnecessary pauses between them

## Instructions

1. Start a shell session using `bash` with args `["--login", "-i"]` (80x20, one-dark theme)
2. Start recording at 10 FPS
3. Type `vim` and press Enter
4. Wait for vim to open
5. Press `i` to enter INSERT mode
6. Type instructions on how to close vim:
   - "How to close Vim:"
   - "1. Press Escape"
   - "2. Type :q! to quit without saving"
   - "3. Or type :wq to save and quit"
7. Press Escape to exit INSERT mode
8. Type `:q!` (show it in command mode before executing)
9. Press Enter to quit
10. Type `echo "This shell session was recorded by Shellwright!"` and press Enter
11. Wait 1 second
12. Stop recording and save as `recording.gif`

## Expected Result

A ~15-20 second GIF showing vim opening, text entry in INSERT mode, the :q! command visible before execution, then an echo message.
