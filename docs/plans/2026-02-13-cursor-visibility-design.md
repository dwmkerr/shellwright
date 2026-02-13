# Cursor Visibility Design

## Summary

Render the terminal cursor in screenshots and recordings when xterm.js reports it as visible.

## Behavior

- Cursor renders automatically when visible in terminal state
- No API changes - no new parameters to tools
- Breaking change: existing outputs will now show cursors where terminal has them visible

## Implementation

Approach: Post-pass cursor rendering in `bufferToSvg`.

After the main cell-rendering loop:

1. Check cursor visibility (`terminal.modes.showCursor` is true, cursor within viewport)
2. Get position from `terminal.buffer.active.cursorX/Y`
3. Get cell at cursor position to determine current fg/bg colors
4. Render filled rectangle at cursor position using `theme.foreground`
5. Re-render character at cursor position with inverted colors (fg/bg swapped)

SVG layering handles visual stacking.

## Design Decisions

- **Block cursor only** - no underline/bar styles for now
- **True color inversion** - text under cursor has fg/bg swapped, not semi-transparent overlay
- **Uses theme.foreground** - no cursor color added to Theme interface
- **Respects terminal state** - renders only when xterm.js cursor is visible

## API Used

- `terminal.modes.showCursor`: Boolean indicating cursor visibility (DECTCEM state)
- `terminal.buffer.active.cursorX/Y`: Cursor position

**Note:** Requires `@xterm/headless@6.1.0-beta.156` or later for `showCursor` mode support.

## Follow-up

Create GitHub issue `rfc: force show/hide cursor option` for users who need explicit override control.
