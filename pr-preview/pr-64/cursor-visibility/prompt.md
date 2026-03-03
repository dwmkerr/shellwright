# Cursor Visibility Test

Verify that the terminal cursor renders correctly in recordings.

## Instructions

1. Start a shell session using `bash` with args `["--login", "-i"]` (80x24, one-dark theme)
2. Start recording at 10 FPS
3. Type `echo "testing cursor"` but DO NOT press Enter
4. Wait 500ms
5. Press Ctrl+A to move cursor to the beginning of the line
6. Wait 1 second so the cursor position is clearly visible
7. Stop recording and save as `recording.gif`
8. Stop the session

## Expected Result

A short recording showing:
- The text `echo "testing cursor"` being typed
- The cursor moving to the beginning of the line (on the 'e' of 'echo')
- The cursor rendered as a block with inverted colors (the 'e' should appear with swapped foreground/background)
